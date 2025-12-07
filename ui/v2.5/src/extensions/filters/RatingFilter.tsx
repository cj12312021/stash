import React, { ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faStarHalfAlt } from "@fortawesome/free-solid-svg-icons";
import { faStar as faStarOutline } from "@fortawesome/free-regular-svg-icons";
import { CriterionModifier } from "src/core/generated-graphql";
import { INumberValue } from "src/models/list-filter/types";
import {
  CriterionOption,
  ModifierCriterion,
} from "src/models/list-filter/criteria/criterion";
import { RatingSystem } from "src/components/Shared/Rating/RatingSystem";
import { RatingStars } from "src/components/Shared/Rating/RatingStars";
import {
  convertToRatingFormat,
  defaultRatingStarPrecision,
  defaultRatingSystemOptions,
  RatingSystemType,
} from "src/utils/rating";
import { ConfigurationContext } from "src/hooks/Config";
import { RatingCriterion } from "src/models/list-filter/criteria/rating";
import { ListFilterModel } from "src/models/list-filter/filter";
import { Option, SidebarListFilter } from "./SidebarListFilter";
import { FacetCountsContext } from "src/extensions/hooks/useFacetCounts";

// ============================================================================
// LEGACY EXPORTS FOR BACKWARDS COMPATIBILITY
// ============================================================================

interface IRatingFilterProps {
  criterion: ModifierCriterion<INumberValue>;
  onValueChanged: (value: INumberValue) => void;
}

export const RatingFilter: React.FC<IRatingFilterProps> = ({
  criterion,
  onValueChanged,
}) => {
  function getRatingSystem(field: "value" | "value2") {
    const defaultValue = field === "value" ? 0 : undefined;

    return (
      <div>
        <RatingSystem
          value={criterion.value[field]}
          onSetRating={(value) => {
            onValueChanged({
              ...criterion.value,
              [field]: value ?? defaultValue,
            });
          }}
          valueRequired
        />
      </div>
    );
  }

  if (
    criterion.modifier === CriterionModifier.Equals ||
    criterion.modifier === CriterionModifier.NotEquals ||
    criterion.modifier === CriterionModifier.GreaterThan ||
    criterion.modifier === CriterionModifier.LessThan
  ) {
    return getRatingSystem("value");
  }

  if (
    criterion.modifier === CriterionModifier.Between ||
    criterion.modifier === CriterionModifier.NotBetween
  ) {
    return (
      <div className="rating-filter">
        {getRatingSystem("value")}
        <span className="and-divider">
          <FormattedMessage id="between_and" />
        </span>
        {getRatingSystem("value2")}
      </div>
    );
  }

  return <></>;
};

// ============================================================================
// NEW IMPROVED SIDEBAR RATING FILTER WITH BUCKETS
// ============================================================================

// Rating bucket definitions
// Each bucket represents a star level with its database value range
interface RatingBucket {
  id: string;
  label: string;
  stars: number;
  minValue: number;  // Inclusive
  maxValue: number;  // Inclusive
}

const RATING_BUCKETS: RatingBucket[] = [
  { id: "bucket-5", label: "★★★★★", stars: 5, minValue: 100, maxValue: 100 },  // Exactly 5 stars
  { id: "bucket-4", label: "★★★★☆", stars: 4, minValue: 80, maxValue: 99 },   // 4.0-4.9 stars
  { id: "bucket-3", label: "★★★☆☆", stars: 3, minValue: 60, maxValue: 79 },   // 3.0-3.9 stars
  { id: "bucket-2", label: "★★☆☆☆", stars: 2, minValue: 40, maxValue: 59 },   // 2.0-2.9 stars
  { id: "bucket-1", label: "★☆☆☆☆", stars: 1, minValue: 20, maxValue: 39 },   // 1.0-1.9 stars
];

// Sum counts within a rating range from the facet counts map
function sumBucketCount(ratingCounts: Map<number, number>, minValue: number, maxValue: number): number {
  let sum = 0;
  // Iterate through all possible values in the range
  // Rating values can be any multiple of 5 (for quarter precision) or 10 (for half precision) or 20 (for full precision)
  for (let rating = minValue; rating <= maxValue; rating++) {
    const count = ratingCounts.get(rating);
    if (count !== undefined) {
      sum += count;
    }
  }
  return sum;
}

// Calculate total rated count (sum of all rating buckets)
function getTotalRatedCount(ratingCounts: Map<number, number>): number {
  let total = 0;
  ratingCounts.forEach((count) => {
    total += count;
  });
  return total;
}

// Format rating value for display
function formatRatingValue(value: number | undefined, precision: string): string {
  if (value === undefined) return "";
  
  const rating = convertToRatingFormat(value, {
    type: RatingSystemType.Stars,
    starPrecision: precision as any,
  });
  
  return rating?.toString() ?? value.toString();
}

// Create icon for rating value
function createRatingIcon(): React.ReactNode {
  return (
    <FontAwesomeIcon
      icon={faStar}
      style={{ marginRight: "0.5em", color: "#f5c518", opacity: 0.7 }}
      fixedWidth
    />
  );
}

// Get bucket label for a given filter value
function getBucketLabelForValue(value: number, value2?: number): string {
  // Check if it's a bucket range
  for (const bucket of RATING_BUCKETS) {
    if (bucket.minValue === bucket.maxValue) {
      // Single value bucket (5-star)
      if (value === bucket.minValue && value2 === undefined) {
        return bucket.label;
      }
    } else {
      // Range bucket
      if (value === bucket.minValue && value2 === bucket.maxValue) {
        return bucket.label;
      }
    }
  }
  // Not a standard bucket - return formatted value
  return `${value / 20}★`;
}

function useRatingFilterState(props: {
  option: CriterionOption;
  filter: ListFilterModel;
  setFilter: (f: ListFilterModel) => void;
  ratingCounts: Map<number, number>;
  countsLoading: boolean;
}) {
  const intl = useIntl();
  const { option, filter, setFilter, ratingCounts, countsLoading } = props;

  const { configuration: config } = React.useContext(ConfigurationContext);
  const ratingSystemOptions =
    config?.ui.ratingSystemOptions ?? defaultRatingSystemOptions;
  const starPrecision = ratingSystemOptions.starPrecision ?? defaultRatingStarPrecision;

  // Track if custom mode is active (showing star picker + modifiers)
  const [customMode, setCustomMode] = useState(false);
  // Track pending rating in custom mode (selected but no modifier chosen yet)
  const [pendingRating, setPendingRating] = useState<number | null>(null);

  const criteria = filter.criteriaFor(option.type) as RatingCriterion[];
  const criterion = criteria.length > 0 ? criteria[0] : null;

  const setCriterion = useCallback(
    (c: RatingCriterion | null) => {
      const newCriteria = filter.criteria.filter(
        (cc) => cc.criterionOption.type !== option.type
      );

      if (c && c.isValid()) newCriteria.push(c);

      setFilter(filter.setCriteria(newCriteria));
    },
    [option.type, setFilter, filter]
  );

  const modifier = criterion?.modifier;
  const value = criterion?.value;

  // Get modifier label for display
  const getModifierLabel = useCallback(
    (mod: CriterionModifier) => {
      switch (mod) {
        case CriterionModifier.Equals:
          return intl.formatMessage({
            id: "criterion_modifier.equals",
            defaultMessage: "is",
          });
        case CriterionModifier.NotEquals:
          return intl.formatMessage({
            id: "criterion_modifier.not_equals",
            defaultMessage: "is not",
          });
        case CriterionModifier.GreaterThan:
          return intl.formatMessage({
            id: "criterion_modifier.greater_than",
            defaultMessage: "greater than",
          });
        case CriterionModifier.LessThan:
          return intl.formatMessage({
            id: "criterion_modifier.less_than",
            defaultMessage: "less than",
          });
        case CriterionModifier.Between:
          return intl.formatMessage({
            id: "criterion_modifier.between",
            defaultMessage: "between",
          });
        case CriterionModifier.NotNull:
          return intl.formatMessage({
            id: "criterion_modifier_values.any",
            defaultMessage: "any",
          });
        case CriterionModifier.IsNull:
          return intl.formatMessage({
            id: "criterion_modifier_values.none",
            defaultMessage: "none",
          });
        default:
          return "";
      }
    },
    [intl]
  );

  // Build selected items list
  const selected = useMemo(() => {
    const selectedItems: Option[] = [];

    // Check for unrated filter
    if (modifier === CriterionModifier.IsNull) {
      selectedItems.push({
        id: "unrated",
        label: intl.formatMessage({ id: "unrated", defaultMessage: "Unrated" }),
      });
      return selectedItems;
    }

    // Check if it matches a bucket (BETWEEN or EQUALS for buckets)
    if (value?.value !== undefined) {
      // Check if this is a standard bucket
      for (const bucket of RATING_BUCKETS) {
        const isBucketMatch = 
          (bucket.minValue === bucket.maxValue && 
           modifier === CriterionModifier.Equals && 
           value.value === bucket.minValue) ||
          (bucket.minValue !== bucket.maxValue && 
           modifier === CriterionModifier.Between && 
           value.value === bucket.minValue && 
           value.value2 === bucket.maxValue);
        
        if (isBucketMatch) {
          selectedItems.push({
            id: bucket.id,
            label: bucket.label,
            icon: createRatingIcon(),
          });
          return selectedItems;
        }
      }

      // Custom filter - show modifier and value
      selectedItems.push({
        id: "custom-filter",
        label: `(${getModifierLabel(modifier!)}) ${formatRatingValue(value.value, starPrecision)}★`,
        icon: createRatingIcon(),
      });
    }
    // If there's a pending rating in custom mode, show it
    else if (pendingRating !== null) {
      const ratingDisplay = formatRatingValue(pendingRating, starPrecision);
      selectedItems.push({
        id: "pending",
        label: `${ratingDisplay}★`,
        icon: createRatingIcon(),
      });
    }

    return selectedItems;
  }, [value, modifier, getModifierLabel, pendingRating, starPrecision, intl]);

  // Calculate bucket counts
  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bucket of RATING_BUCKETS) {
      counts[bucket.id] = sumBucketCount(ratingCounts, bucket.minValue, bucket.maxValue);
    }
    return counts;
  }, [ratingCounts]);

  // Build candidates list
  const candidates = useMemo(() => {
    // If in custom mode with pending rating, show modifier options
    if (customMode && pendingRating !== null) {
      return [
        {
          id: "mod-equals",
          label: `(${getModifierLabel(CriterionModifier.Equals)})`,
          className: "modifier-object",
          canExclude: false,
        },
        {
          id: "mod-not_equals",
          label: `(${getModifierLabel(CriterionModifier.NotEquals)})`,
          className: "modifier-object",
          canExclude: false,
        },
        {
          id: "mod-greater_than",
          label: `(${getModifierLabel(CriterionModifier.GreaterThan)})`,
          className: "modifier-object",
          canExclude: false,
        },
        {
          id: "mod-less_than",
          label: `(${getModifierLabel(CriterionModifier.LessThan)})`,
          className: "modifier-object",
          canExclude: false,
        },
        {
          id: "cancel-custom",
          label: `(${intl.formatMessage({ id: "actions.cancel", defaultMessage: "Cancel" })})`,
          className: "modifier-object",
          canExclude: false,
        },
      ];
    }

    // If filter is already active, don't show any candidates
    if (value?.value !== undefined || modifier === CriterionModifier.IsNull) {
      return [];
    }

    const candidateList: Option[] = [];

    // Add rating bucket options with counts (5 stars down to 1 star)
    for (const bucket of RATING_BUCKETS) {
      const count = bucketCounts[bucket.id];
      // Show all buckets, but indicate zero count
      candidateList.push({
        id: bucket.id,
        label: bucket.label,
        count: countsLoading ? undefined : count,
        canExclude: false,
      });
    }

    // Add separator-like "Unrated" option
    const totalRated = getTotalRatedCount(ratingCounts);
    candidateList.push({
      id: "unrated",
      label: intl.formatMessage({ id: "unrated", defaultMessage: "Unrated" }),
      count: undefined, // We don't have unrated count from backend
      canExclude: false,
    });

    // Add "Custom..." option for advanced filtering
    candidateList.push({
      id: "custom",
      label: `${intl.formatMessage({ id: "custom", defaultMessage: "Custom" })}...`,
      className: "modifier-object",
      canExclude: false,
    });

    return candidateList;
  }, [value, modifier, customMode, pendingRating, getModifierLabel, intl, bucketCounts, ratingCounts, countsLoading]);

  const onSelect = useCallback(
    (v: Option, _exclude: boolean) => {
      // Handle bucket selection - apply filter immediately
      if (v.id.startsWith("bucket-")) {
        const bucket = RATING_BUCKETS.find(b => b.id === v.id);
        if (bucket) {
          const newCriterion = criterion
            ? (criterion.clone() as RatingCriterion)
            : (option.makeCriterion() as RatingCriterion);
          
          if (bucket.minValue === bucket.maxValue) {
            // Single value (5-star) - use EQUALS
            newCriterion.modifier = CriterionModifier.Equals;
            newCriterion.value = { value: bucket.minValue, value2: undefined };
          } else {
            // Range - use BETWEEN
            newCriterion.modifier = CriterionModifier.Between;
            newCriterion.value = { value: bucket.minValue, value2: bucket.maxValue };
          }
          
          setCriterion(newCriterion);
          setCustomMode(false);
          setPendingRating(null);
        }
        return;
      }

      // Handle "Unrated" selection
      if (v.id === "unrated") {
        const newCriterion = criterion
          ? (criterion.clone() as RatingCriterion)
          : (option.makeCriterion() as RatingCriterion);
        newCriterion.modifier = CriterionModifier.IsNull;
        newCriterion.value = { value: undefined, value2: undefined };
        setCriterion(newCriterion);
        setCustomMode(false);
        setPendingRating(null);
        return;
      }

      // Handle "Custom..." selection
      if (v.id === "custom") {
        setCustomMode(true);
        setPendingRating(null);
        return;
      }

      // Handle cancel in custom mode
      if (v.id === "cancel-custom") {
        setCustomMode(false);
        setPendingRating(null);
        return;
      }

      // Handle modifier selection in custom mode
      if (v.id.startsWith("mod-") && pendingRating !== null) {
        const newCriterion = criterion
          ? (criterion.clone() as RatingCriterion)
          : (option.makeCriterion() as RatingCriterion);
        newCriterion.value = { value: pendingRating, value2: undefined };

        let mod = CriterionModifier.Equals;
        switch (v.id) {
          case "mod-equals":
            mod = CriterionModifier.Equals;
            break;
          case "mod-not_equals":
            mod = CriterionModifier.NotEquals;
            break;
          case "mod-greater_than":
            mod = CriterionModifier.GreaterThan;
            break;
          case "mod-less_than":
            mod = CriterionModifier.LessThan;
            break;
        }
        newCriterion.modifier = mod;
        setCriterion(newCriterion);
        setCustomMode(false);
        setPendingRating(null);
      }
    },
    [criterion, option, setCriterion, pendingRating]
  );

  const onUnselect = useCallback(
    (v: Option, _exclude: boolean) => {
      // Clear the filter
      setCriterion(null);
      setCustomMode(false);
      setPendingRating(null);
    },
    [setCriterion]
  );

  const onRatingSelect = useCallback(
    (ratingValue: number | null) => {
      if (ratingValue === null) {
        setPendingRating(null);
        return;
      }
      // In custom mode, store as pending - wait for modifier selection
      setPendingRating(ratingValue);
    },
    []
  );

  return {
    selected,
    candidates,
    onSelect,
    onUnselect,
    onRatingSelect,
    starPrecision,
    pendingRating,
    customMode,
    hasActiveFilter: value?.value !== undefined || modifier === CriterionModifier.IsNull,
    countsLoading,
  };
}

interface ISidebarFilter {
  title?: ReactNode;
  option: CriterionOption;
  filter: ListFilterModel;
  setFilter: (f: ListFilterModel) => void;
  sectionID?: string;
}

export const SidebarRatingFilter: React.FC<ISidebarFilter> = ({
  title,
  option,
  filter,
  setFilter,
  sectionID,
}) => {
  // Get facet counts from context
  const { counts: facetCounts, loading: facetsLoading } = useContext(FacetCountsContext);
  
  const state = useRatingFilterState({ 
    option, 
    filter, 
    setFilter,
    ratingCounts: facetCounts.ratings,
    countsLoading: facetsLoading,
  });

  // Show rating stars input only in custom mode (after clicking "Custom...")
  const showRatingStars = state.customMode && state.pendingRating === null;

  const ratingStarsInput = showRatingStars ? (
    <div className="rating-stars-input" style={{ padding: "0.5rem", borderBottom: "1px solid var(--bs-border-color)" }}>
      <div style={{ marginBottom: "0.25rem", fontSize: "0.85em", opacity: 0.7 }}>
        <FormattedMessage id="select_rating" defaultMessage="Select a rating:" />
      </div>
      <RatingStars
        value={null}
        onSetRating={state.onRatingSelect}
        precision={state.starPrecision as any}
      />
    </div>
  ) : null;

  return (
    <SidebarListFilter
      title={title}
      candidates={state.candidates}
      onSelect={state.onSelect}
      onUnselect={state.onUnselect}
      selected={state.selected}
      canExclude={false}
      singleValue={true}
      sectionID={sectionID}
      preCandidates={ratingStarsInput}
      countsLoading={state.countsLoading}
    />
  );
};
