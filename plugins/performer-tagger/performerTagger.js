(function () {
  "use strict";

  const PluginApi = window.PluginApi;
  const React = PluginApi.React;
  const GQL = PluginApi.GQL;

  const PLUGIN_ID = "performer-tagger";

  // Field display names for the UI
  const FIELD_LABELS = {
    gender: "Gender",
    ethnicity: "Ethnicity",
    eye_color: "Eye Color",
    hair_color: "Hair Color",
    measurements: "Measurements",
    fake_tits: "Breast Type",
    tattoos: "Tattoos",
    piercings: "Piercings",
  };

  // =========================================================================
  // Utility Functions
  // =========================================================================

  /**
   * Run a plugin task and wait for completion
   */
  async function runPluginTask(taskName, args) {
    const client = PluginApi.utils.StashService.getClient();
    
    const result = await client.mutate({
      mutation: GQL.RunPluginTaskDocument,
      variables: {
        plugin_id: PLUGIN_ID,
        task_name: taskName,
        args_map: args,
      },
    });

    return result.data?.runPluginTask;
  }

  /**
   * Show a toast notification
   */
  function showToast(message, variant = "success") {
    const Toast = PluginApi.hooks.useToast;
    // Toast needs to be called from within a component
    // We'll handle this differently
    console.log(`[PerformerTagger] ${variant}: ${message}`);
  }

  // =========================================================================
  // Analyze Button Component
  // =========================================================================

  const AnalyzeImageButton = ({ imageUrl, performerId, onTagsReceived }) => {
    const { Button } = PluginApi.libraries.Bootstrap;
    const { faWandMagicSparkles } = PluginApi.libraries.FontAwesomeSolid;
    const { Icon, LoadingIndicator } = PluginApi.components;

    const [isAnalyzing, setIsAnalyzing] = React.useState(false);
    const [suggestedTags, setSuggestedTags] = React.useState(null);
    const Toast = PluginApi.hooks.useToast();

    const handleAnalyze = async () => {
      setIsAnalyzing(true);
      setSuggestedTags(null);

      try {
        const jobId = await runPluginTask("Analyze Image", {
          mode: "analyze_image",
          image_url: imageUrl,
          performer_id: performerId,
        });

        Toast.toast({
          variant: "info",
          content: "Analyzing image... Check the Tasks page for progress.",
        });

        // The actual results will come through the plugin output
        // For now, we show a message
        if (onTagsReceived) {
          // This would need webhook/polling support to get results
          // For MVP, user checks results in log
        }
      } catch (error) {
        console.error("[PerformerTagger] Analysis failed:", error);
        Toast.toast({
          variant: "danger",
          content: `Analysis failed: ${error.message}`,
        });
      } finally {
        setIsAnalyzing(false);
      }
    };

    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        title="Analyze image with AI to suggest performer tags"
        className="performer-tagger-btn"
      >
        {isAnalyzing ? (
          <>
            <LoadingIndicator inline small /> Analyzing...
          </>
        ) : (
          <>
            <Icon icon={faWandMagicSparkles} /> AI Tag
          </>
        )}
      </Button>
    );
  };

  // =========================================================================
  // Tag Suggestion Modal Component
  // =========================================================================

  const TagSuggestionModal = ({ show, onHide, performerId, suggestedTags, existingTags }) => {
    const { Modal, Button, Form } = PluginApi.libraries.Bootstrap;
    const { LoadingIndicator } = PluginApi.components;
    const Toast = PluginApi.hooks.useToast();

    const [selectedTags, setSelectedTags] = React.useState([]);
    const [isApplying, setIsApplying] = React.useState(false);

    React.useEffect(() => {
      if (suggestedTags) {
        // Pre-select all suggested tags that aren't already applied
        const newTags = suggestedTags.filter(
          (tag) => !existingTags.some((et) => et.name.toLowerCase() === tag.toLowerCase())
        );
        setSelectedTags(newTags);
      }
    }, [suggestedTags, existingTags]);

    const handleApply = async () => {
      if (selectedTags.length === 0) {
        onHide();
        return;
      }

      setIsApplying(true);
      try {
        await runPluginTask("Apply Tags to Performer", {
          mode: "apply_tags",
          performer_id: performerId,
          tags: selectedTags,
        });

        Toast.toast({
          variant: "success",
          content: `Applied ${selectedTags.length} tags to performer`,
        });
        onHide();
        // Refresh the page to show new tags
        window.location.reload();
      } catch (error) {
        Toast.toast({
          variant: "danger",
          content: `Failed to apply tags: ${error.message}`,
        });
      } finally {
        setIsApplying(false);
      }
    };

    const toggleTag = (tag) => {
      setSelectedTags((prev) =>
        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
      );
    };

    if (!show) return null;

    return (
      <Modal show={show} onHide={onHide} centered>
        <Modal.Header closeButton>
          <Modal.Title>AI Suggested Tags</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {suggestedTags && suggestedTags.length > 0 ? (
            <div className="suggested-tags-list">
              <p>Select tags to apply to this performer:</p>
              {suggestedTags.map((tag) => {
                const isExisting = existingTags.some(
                  (et) => et.name.toLowerCase() === tag.toLowerCase()
                );
                return (
                  <Form.Check
                    key={tag}
                    type="checkbox"
                    id={`tag-${tag}`}
                    label={
                      <>
                        {tag}
                        {isExisting && (
                          <span className="text-muted ml-2">(already applied)</span>
                        )}
                      </>
                    }
                    checked={selectedTags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                    disabled={isExisting}
                  />
                );
              })}
            </div>
          ) : (
            <p>No tags suggested for this image.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={isApplying || selectedTags.length === 0}
          >
            {isApplying ? (
              <>
                <LoadingIndicator inline small /> Applying...
              </>
            ) : (
              `Apply ${selectedTags.length} Tags`
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  };

  // =========================================================================
  // Patch Image Detail Panel - Add analyze button
  // =========================================================================

  PluginApi.patch.after("ImageDetailPanel", function (props, _ctx, result) {
    const image = props.image;
    if (!image) return result;

    // Get performers from the image
    const performers = image.performers || [];
    if (performers.length === 0) return result;

    const imageUrl = image.paths?.image;
    if (!imageUrl) return result;

    // Create button for each performer
    const analyzeButtons = performers.map((performer) => (
      <div key={performer.id} className="performer-tagger-container">
        <span className="performer-tagger-label">
          AI Tag for {performer.name}:
        </span>
        <AnalyzeImageButton
          imageUrl={imageUrl}
          performerId={performer.id}
        />
      </div>
    ));

    // Append buttons to the result
    return (
      <>
        {result}
        <div className="performer-tagger-section">
          <hr />
          <h6>Performer Auto-Tagger</h6>
          {analyzeButtons}
        </div>
      </>
    );
  });

  // =========================================================================
  // Patch Performer Details Panel - Add quick analyze button
  // =========================================================================

  PluginApi.patch.after("PerformerDetailsPanel", function (props, _ctx, result) {
    const { Button } = PluginApi.libraries.Bootstrap;
    const { faWandMagicSparkles } = PluginApi.libraries.FontAwesomeSolid;
    const { Icon } = PluginApi.components;
    const Toast = PluginApi.hooks.useToast();

    const performer = props.performer;
    if (!performer) return result;

    const [isAnalyzing, setIsAnalyzing] = React.useState(false);

    // Check which fields are empty
    const emptyFields = [];
    for (const [field, label] of Object.entries(FIELD_LABELS)) {
      const value = performer[field];
      if (!value || String(value).trim() === "") {
        emptyFields.push(label);
      }
    }

    const handleAnalyzePerformer = async () => {
      setIsAnalyzing(true);
      try {
        await runPluginTask("Analyze Image", {
          mode: "analyze_performer",
          performer_id: performer.id,
        });

        Toast.toast({
          variant: "info",
          content: "Analyzing performer images... Check Tasks page for progress and results.",
        });
      } catch (error) {
        Toast.toast({
          variant: "danger",
          content: `Failed to start analysis: ${error.message}`,
        });
      } finally {
        setIsAnalyzing(false);
      }
    };

    return (
      <>
        {result}
        <div className="performer-tagger-performer-section mt-3">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleAnalyzePerformer}
            disabled={isAnalyzing}
            title="Analyze this performer's images to suggest tags and fill empty profile fields"
          >
            <Icon icon={faWandMagicSparkles} />
            {isAnalyzing ? " Analyzing..." : " AI Suggest Tags & Attributes"}
          </Button>
          {emptyFields.length > 0 && (
            <div className="performer-tagger-empty-fields text-muted mt-1">
              <small>
                Empty fields that can be auto-filled: {emptyFields.join(", ")}
              </small>
            </div>
          )}
        </div>
      </>
    );
  });

  // =========================================================================
  // Add to Performer Images Panel - Button on each image
  // =========================================================================

  PluginApi.patch.after("PerformerImagesPanel", function (props, _ctx, result) {
    // This adds a small info section about the auto-tagger
    const performer = props.performer;
    if (!performer) return result;

    return (
      <>
        <div className="performer-tagger-info alert alert-info mb-3">
          <strong>Performer Auto-Tagger:</strong> Click on an image to view it,
          then use the "AI Tag" button to analyze it and suggest tags for{" "}
          {performer.name}.
        </div>
        {result}
      </>
    );
  });

  console.log("[PerformerTagger] UI Plugin loaded successfully");
})();

