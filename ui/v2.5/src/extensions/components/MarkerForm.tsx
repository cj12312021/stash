/**
 * MarkerForm - Fork of SceneMarkerForm with mockup-matching layout
 *
 * Key differences from upstream SceneMarkerForm:
 * - Single-column layout with labels ABOVE inputs (not beside)
 * - Full-width inputs
 * - START TIME and END TIME side-by-side on same row
 * - Labels match mockup: "START TIME", "END TIME (OPTIONAL)"
 * - Tags shown as removable pills
 * - Custom time input with sync button inside
 *
 * This is a fork to avoid merge conflicts with upstream.
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Button, Form } from "react-bootstrap";
import { useFormik } from "formik";
import * as yup from "yup";
import { useApolloClient } from "@apollo/client";
import * as GQL from "src/core/generated-graphql";
import {
  useSceneMarkerCreate,
  useSceneMarkerUpdate,
  useSceneMarkerDestroy,
} from "src/core/StashService";
import { MarkerTitleSuggest } from "src/components/Shared/Select";
import { getPlayerPosition } from "src/components/ScenePlayer/util";
import { useToast } from "src/hooks/Toast";
import isEqual from "lodash-es/isEqual";
import { yupFormikValidate } from "src/utils/yup";
import { Tag, TagSelect } from "src/components/Tags/TagSelect";
import TextUtils from "src/utils/text";
import { Icon } from "src/components/Shared/Icon";
import { faClock } from "@fortawesome/free-solid-svg-icons";

interface IMarkerFormProps {
  sceneID: string;
  marker?: GQL.SceneMarkerDataFragment;
  onClose: () => void;
}

// Custom time input component matching mockup design
interface ITimeInputProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  error?: string;
}

const TimeInput: React.FC<ITimeInputProps> = ({
  value,
  onChange,
  placeholder = "0:00:00",
  error,
}) => {
  const [tmpValue, setTmpValue] = useState<string>();

  const displayValue = useMemo(() => {
    if (tmpValue !== undefined) {
      return tmpValue;
    } else if (value !== null && value !== undefined) {
      return TextUtils.secondsToTimestamp(value, true);
    }
    return "";
  }, [value, tmpValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTmpValue(e.currentTarget.value);
  };

  const handleBlur = () => {
    if (tmpValue !== undefined) {
      const seconds = TextUtils.timestampToSeconds(tmpValue);
      onChange(seconds !== null && seconds >= 0 ? seconds : null);
      setTmpValue(undefined);
    }
  };

  const handleSync = () => {
    const currentTime = getPlayerPosition();
    if (currentTime != null) {
      onChange(Math.round(currentTime));
    }
  };

  return (
    <div className={`marker-time-input ${error ? "has-error" : ""}`}>
      <input
        type="text"
        className="marker-time-field"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="marker-time-sync"
        onClick={handleSync}
        title="Sync to current time"
      >
        <Icon icon={faClock} />
      </button>
      {error && <div className="marker-time-error">{error}</div>}
    </div>
  );
};

// Tag pill component
interface ITagPillProps {
  tag: Tag;
  onRemove: () => void;
}

const TagPill: React.FC<ITagPillProps> = ({ tag, onRemove }) => (
  <span className="marker-tag-pill">
    {tag.name}
    <button
      type="button"
      className="marker-tag-remove"
      onClick={onRemove}
      aria-label={`Remove ${tag.name}`}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
      </svg>
    </button>
  </span>
);

export const MarkerForm: React.FC<IMarkerFormProps> = ({
  sceneID,
  marker,
  onClose,
}) => {
  const client = useApolloClient();
  const [sceneMarkerCreate] = useSceneMarkerCreate();
  const [sceneMarkerUpdate] = useSceneMarkerUpdate();
  const [sceneMarkerDestroy] = useSceneMarkerDestroy();
  const Toast = useToast();

  // Refetch scene data to update markers in player
  const refetchScene = useCallback(async () => {
    await client.refetchQueries({
      include: [GQL.FindSceneDocument],
    });
  }, [client]);

  const [primaryTag, setPrimaryTag] = useState<Tag>();
  const [tags, setTags] = useState<Tag[]>([]);

  const isNew = marker === undefined;

  const schema = yup.object({
    title: yup.string().ensure(),
    seconds: yup.number().min(0).required(),
    end_seconds: yup
      .number()
      .min(0)
      .nullable()
      .defined()
      .test(
        "is-greater-than-seconds",
        "End time must be after start time",
        function (value) {
          // Use > not >= since end time should be strictly after start time
          return value === null || value > this.parent.seconds;
        }
      ),
    primary_tag_id: yup.string().required("Primary tag is required"),
    tag_ids: yup.array(yup.string().required()).defined(),
  });

  const initialValues = useMemo(
    () => ({
      title: marker?.title ?? "",
      seconds: marker?.seconds ?? Math.round(getPlayerPosition() ?? 0),
      end_seconds: marker?.end_seconds ?? null,
      primary_tag_id: marker?.primary_tag.id ?? "",
      tag_ids: marker?.tags.map((tag) => tag.id) ?? [],
    }),
    [marker]
  );

  type InputValues = yup.InferType<typeof schema>;

  const formik = useFormik<InputValues>({
    initialValues,
    enableReinitialize: true,
    validate: yupFormikValidate(schema),
    onSubmit: (values) => handleSave(schema.cast(values)),
  });

  // Set primary tag
  const onSetPrimaryTag = useCallback(
    (item: Tag) => {
      setPrimaryTag(item);
      formik.setFieldValue("primary_tag_id", item.id);
    },
    [formik]
  );

  // Remove primary tag
  const onRemovePrimaryTag = useCallback(() => {
    setPrimaryTag(undefined);
    formik.setFieldValue("primary_tag_id", "");
  }, [formik]);

  // Set additional tags
  const onSetTags = useCallback(
    (items: Tag[]) => {
      setTags(items);
      formik.setFieldValue(
        "tag_ids",
        items.map((item) => item.id)
      );
    },
    [formik]
  );

  // Remove single tag
  const onRemoveTag = useCallback(
    (tagId: string) => {
      const newTags = tags.filter((t) => t.id !== tagId);
      setTags(newTags);
      formik.setFieldValue(
        "tag_ids",
        newTags.map((t) => t.id)
      );
    },
    [formik, tags]
  );

  // Initialize tags from marker
  useEffect(() => {
    setPrimaryTag(
      marker?.primary_tag
        ? { ...marker.primary_tag, aliases: [], stash_ids: [] }
        : undefined
    );
  }, [marker?.primary_tag]);

  useEffect(() => {
    setTags(
      marker?.tags.map((t) => ({
        ...t,
        aliases: [],
        stash_ids: [],
      })) ?? []
    );
  }, [marker?.tags]);

  async function handleSave(input: InputValues) {
    try {
      if (isNew) {
        await sceneMarkerCreate({
          variables: {
            scene_id: sceneID,
            ...input,
            end_seconds: input.end_seconds ?? null,
          },
        });
      } else {
        await sceneMarkerUpdate({
          variables: {
            id: marker.id,
            scene_id: sceneID,
            ...input,
            end_seconds: input.end_seconds ?? null,
          },
        });
      }
      // Refetch scene data to update markers in player, then close
      await refetchScene();
      onClose();
    } catch (e) {
      Toast.error(e);
      onClose();
    }
  }

  async function handleDelete() {
    if (isNew) return;

    try {
      await sceneMarkerDestroy({ variables: { id: marker.id } });
      // Refetch scene data to update markers in player, then close
      await refetchScene();
      onClose();
    } catch (e) {
      Toast.error(e);
      onClose();
    }
  }

  const { error: secondsError } = formik.getFieldMeta("seconds");
  const { error: endSecondsError } = formik.getFieldMeta("end_seconds");

  return (
    <Form noValidate onSubmit={formik.handleSubmit} className="marker-form">
      {/* Title Field */}
      <div className="marker-field">
        <label className="marker-label">TITLE</label>
        <MarkerTitleSuggest
          initialMarkerTitle={formik.values.title}
          onChange={(v) => formik.setFieldValue("title", v)}
        />
      </div>

      {/* Primary Tag Field */}
      <div className="marker-field">
        <label className="marker-label">PRIMARY TAG</label>
        <div className="marker-tag-container">
          {primaryTag ? (
            <TagPill tag={primaryTag} onRemove={onRemovePrimaryTag} />
          ) : (
            <TagSelect
              onSelect={(t) => t[0] && onSetPrimaryTag(t[0])}
              values={[]}
              hoverPlacement="right"
            />
          )}
        </div>
        {formik.touched.primary_tag_id && formik.errors.primary_tag_id && (
          <div className="marker-field-error">{formik.errors.primary_tag_id}</div>
        )}
      </div>

      {/* Time Fields Row - Side by Side */}
      <div className="marker-time-row">
        <div className="marker-field marker-time-field-wrapper">
          <label className="marker-label">START TIME</label>
          <TimeInput
            value={formik.values.seconds}
            onChange={(v) => formik.setFieldValue("seconds", v ?? 0)}
            error={secondsError}
          />
        </div>
        <div className="marker-field marker-time-field-wrapper">
          <label className="marker-label">END TIME (OPTIONAL)</label>
          <TimeInput
            value={formik.values.end_seconds}
            onChange={(v) => formik.setFieldValue("end_seconds", v)}
            placeholder="0:05:57"
            error={endSecondsError}
          />
        </div>
      </div>

      {/* Additional Tags Field */}
      <div className="marker-field">
        <label className="marker-label">ADDITIONAL TAGS</label>
        <div className="marker-tag-container marker-tag-multi">
          {tags.map((tag) => (
            <TagPill
              key={tag.id}
              tag={tag}
              onRemove={() => onRemoveTag(tag.id)}
            />
          ))}
          <TagSelect
            isMulti
            onSelect={onSetTags}
            values={tags}
            hoverPlacement="right"
          />
        </div>
      </div>

      {/* Footer with Buttons */}
      <div className="marker-form-footer">
        <Button
          variant="primary"
          disabled={(!isNew && !formik.dirty) || !isEqual(formik.errors, {})}
          onClick={() => formik.submitForm()}
        >
          Save
        </Button>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        {!isNew && (
          <Button variant="danger" onClick={() => handleDelete()}>
            Delete
          </Button>
        )}
      </div>
    </Form>
  );
};

export default MarkerForm;
