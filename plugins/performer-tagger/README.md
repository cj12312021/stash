# Performer Auto-Tagger Plugin for Stash

Automatically tag performers based on AI analysis of their images - with a convenient UI integration!

## Features

- **🖼️ UI Integration** - Analyze images directly from the Stash interface
- **🎯 Selective Analysis** - Choose which images to analyze instead of processing everything
- **✅ Review Before Applying** - See suggested tags before they're applied
- **📝 Auto-Fill Profile Fields** - Automatically populate empty performer fields:
  - Gender, Ethnicity, Eye Color, Hair Color
  - Measurements, Breast Type (natural/enhanced)
  - Tattoos & Piercings descriptions
- **🛡️ Safe Updates** - Only fills fields that are currently empty (won't overwrite existing data)
- **🔞 NSFW Friendly** - Works with adult content using local models
- Supports multiple AI backends:
  - **Ollama + LLaVA** (local) - ✅ **NSFW friendly**, recommended
  - **CLIP** (local) - ✅ **NSFW friendly**, fast (tags only, no attributes)
  - **OpenAI Vision API** - ❌ Rejects explicit content (SFW only)

## Installation

### 1. Copy the Plugin

Copy the plugin folder to your Stash plugins directory:

**Windows:**
```powershell
Copy-Item -Recurse "plugins\performer-tagger" "$env:USERPROFILE\.stash\plugins\"
```

**Linux/Mac:**
```bash
cp -r plugins/performer-tagger ~/.stash/plugins/
```

### 2. Install Python Dependencies

```bash
cd ~/.stash/plugins/performer-tagger
pip install requests Pillow
```

### 3. Choose an AI Backend

#### Option A: Ollama + LLaVA (Recommended for NSFW)

Ollama runs vision models locally with **no content restrictions**.

1. Install Ollama: https://ollama.ai
2. Pull a vision model:
   ```bash
   ollama pull llava        # 4GB, good quality
   # OR
   ollama pull llava:13b    # 8GB, better quality
   # OR  
   ollama pull bakllava     # 4GB, alternative
   ```
3. Ollama runs automatically on `http://localhost:11434`

#### Option B: Local CLIP Model (NSFW friendly, faster)

CLIP runs entirely locally - fast but less descriptive.
```bash
pip install torch transformers
```
Note: First run downloads the model (~600MB)

#### Option C: OpenAI Vision (SFW only!)

⚠️ **WARNING**: OpenAI will **reject explicit NSFW images**. Only use for SFW performer headshots.
```bash
pip install openai
```
Set API key in Stash: Settings → Plugins → Performer Auto-Tagger

### 4. Reload Plugins

In Stash: **Settings → Plugins → Reload Plugins**

## Usage

### From an Image

1. Navigate to any **Image** in your library
2. Scroll to the **Performer Auto-Tagger** section
3. Click the **"AI Tag"** button next to a performer's name
4. The plugin will analyze the image and suggest tags
5. Check the **Tasks** page to see results

### From a Performer Page

1. Go to a **Performer's detail page**
2. Click the **"AI Suggest Tags"** button
3. The plugin will analyze multiple images
4. Review and apply the suggested tags

### Batch Processing

For processing all performers at once:
1. Go to **Settings → Tasks**
2. Find **Plugin Tasks → Performer Auto-Tagger**
3. Run "Tag All Performers" or "Analyze Without Tagging" (preview mode)

## Configuration

In **Settings → Plugins → Performer Auto-Tagger**:

| Setting | Description | Default |
|---------|-------------|---------|
| Use Ollama | Enable local Ollama analysis | true |
| Ollama URL | Ollama API endpoint | http://localhost:11434 |
| Ollama Model | Vision model name | llava |
| OpenAI API Key | For OpenAI backend (SFW only) | - |
| Confidence Threshold | Min confidence to suggest tag (0.0-1.0) | 0.3 |

## Customizing Tags

Edit the `DEFAULT_TAG_CATEGORIES` dict in `tagger.py` to customize which tags the plugin looks for:

```python
DEFAULT_TAG_CATEGORIES = {
    "hair_color": ["blonde", "brunette", "redhead", ...],
    "body_features": ["tattoos", "piercings", ...],
    # Add your own categories and tags
}
```

## Performer Fields Auto-Population

The plugin can automatically fill these performer profile fields (only if currently empty):

| Field | What AI Looks For | Example Values |
|-------|-------------------|----------------|
| **Gender** | Male, Female, Trans, Non-binary | MALE, FEMALE, TRANSGENDER_FEMALE |
| **Ethnicity** | Racial/ethnic appearance | caucasian, asian, latina, black |
| **Eye Color** | Eye color | brown, blue, green, hazel |
| **Hair Color** | Hair color | blonde, brunette, black, red |
| **Measurements** | Body measurements estimate | 34D-24-36 |
| **Breast Type** | Natural or enhanced | natural, enhanced |
| **Tattoos** | Description of visible tattoos | "sleeve on left arm, butterfly on back" |
| **Piercings** | Description of visible piercings | "nose ring, ear piercings" |

**Important:** The plugin will NEVER overwrite existing values. It only fills fields that are empty.

## How It Works

1. **UI Button Click** → Triggers plugin task via GraphQL
2. **Backend Script** → Analyzes image(s) with AI
3. **AI Model** → Returns detected attributes as tags
4. **Results Logged** → Check Tasks/Logs for suggested tags
5. **Apply Tags** → Use the apply task to add selected tags

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Stash UI                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │  performerTagger.js                          │   │
│  │  - Adds "AI Tag" buttons to Image/Performer  │   │
│  │  - Calls plugin tasks via GraphQL            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ GraphQL: runPluginTask
┌─────────────────────────────────────────────────────┐
│  Stash Server                                        │
│  ┌──────────────────────────────────────────────┐   │
│  │  tagger.py (Python backend)                  │   │
│  │  - Receives image URL / performer ID         │   │
│  │  - Calls AI analyzer (Ollama/CLIP/OpenAI)    │   │
│  │  - Returns suggested tags                    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  AI Backend (choose one)                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │   Ollama     │ │    CLIP      │ │   OpenAI     │ │
│  │   (LLaVA)    │ │   (local)    │ │   (cloud)    │ │
│  │   ✅ NSFW    │ │   ✅ NSFW    │ │   ❌ SFW only│ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Troubleshooting

### "No ML backend available"
- Install either `openai` or `torch transformers` packages
- Or install and start Ollama

### Ollama connection errors
- Make sure Ollama is running: `ollama serve`
- Check the URL in settings (default: http://localhost:11434)
- Verify model is downloaded: `ollama list`

### UI buttons not appearing
- Reload plugins: Settings → Plugins → Reload Plugins
- Clear browser cache and refresh
- Check browser console for JavaScript errors

### Tags not being detected
- Lower the `confidence_threshold` in settings
- Ensure your tag names match those in `DEFAULT_TAG_CATEGORIES`
- Try a different/larger model (e.g., `llava:13b` instead of `llava`)

## Cost Considerations

- **Ollama + LLaVA**: Free (runs locally)
- **CLIP**: Free (runs locally)
- **OpenAI**: ~$0.01-0.03 per image

## License

MIT License - Feel free to modify and share!
