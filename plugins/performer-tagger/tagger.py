#!/usr/bin/env python3
"""
Performer Auto-Tagger Plugin for Stash.

Analyzes performer images using AI/ML and automatically assigns relevant tags.
Supports multiple analysis backends: OpenAI Vision, CLIP, or simple heuristics.
"""
import json
import sys
import os
from typing import List, Dict, Set, Optional, Any
from io import BytesIO

import log
from stash_interface import StashInterface

# Optional imports - will be checked at runtime
try:
    import requests
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import torch
    from transformers import CLIPProcessor, CLIPModel
    HAS_CLIP = True
except ImportError:
    HAS_CLIP = False

try:
    import openai
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

# Check for Ollama (local LLM with vision - NSFW friendly)
HAS_OLLAMA = False
try:
    import requests as req_test
    # We'll test connection when actually used
    HAS_OLLAMA = True
except ImportError:
    pass


# =============================================================================
# Configuration
# =============================================================================

# Default tag categories to detect (customize these for your library)
DEFAULT_TAG_CATEGORIES = {
    "hair_color": [
        "blonde", "brunette", "redhead", "black hair", "auburn hair",
        "gray hair", "white hair", "dyed hair", "highlights"
    ],
    "hair_style": [
        "long hair", "short hair", "curly hair", "straight hair",
        "wavy hair", "bangs", "ponytail", "braids", "bun", "pixie cut"
    ],
    "body_features": [
        "tattoos", "piercings", "muscular", "slim", "curvy", "athletic",
        "freckles"
    ],
    "accessories": [
        "glasses", "sunglasses", "earrings", "necklace", "choker"
    ],
    "ethnicity": [
        "asian", "caucasian", "latina", "african american", "middle eastern",
        "mixed race", "indian"
    ],
    "age_range": [
        "young", "mature", "milf"
    ]
}

# Performer attributes that can be auto-populated from images
# Maps our detection names to Stash field names
PERFORMER_ATTRIBUTES = {
    "gender": {
        "field": "gender",
        "type": "enum",
        "values": ["MALE", "FEMALE", "TRANSGENDER_MALE", "TRANSGENDER_FEMALE", "INTERSEX", "NON_BINARY"],
        "prompt_options": ["male", "female", "transgender male", "transgender female", "intersex", "non-binary"]
    },
    "ethnicity": {
        "field": "ethnicity",
        "type": "string",
        "prompt_options": ["caucasian", "asian", "black/african", "latina/hispanic", "middle eastern", "indian", "mixed race", "pacific islander"]
    },
    "eye_color": {
        "field": "eye_color",
        "type": "string",
        "prompt_options": ["brown", "blue", "green", "hazel", "gray", "black", "amber"]
    },
    "hair_color": {
        "field": "hair_color",
        "type": "string",
        "prompt_options": ["blonde", "brunette", "black", "red", "auburn", "gray", "white", "dyed/colorful"]
    },
    "fake_tits": {
        "field": "fake_tits",
        "type": "string",
        "prompt_options": ["natural", "enhanced/fake"]
    },
    "has_tattoos": {
        "field": "tattoos",
        "type": "description",
        "prompt": "Describe visible tattoos (location and type) or 'none' if no tattoos visible"
    },
    "has_piercings": {
        "field": "piercings", 
        "type": "description",
        "prompt": "Describe visible piercings (location) or 'none' if no piercings visible"
    },
    "measurements": {
        "field": "measurements",
        "type": "string",
        "prompt": "Estimate body measurements in format like '34D-24-36' or 'unknown' if cannot determine"
    }
}

# Plugin ID for settings
PLUGIN_ID = "performer-tagger"


# =============================================================================
# Image Analyzers
# =============================================================================

class AnalysisResult:
    """Container for analysis results including tags and attributes."""
    
    def __init__(self):
        self.tags: List[str] = []
        self.attributes: Dict[str, Any] = {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "tags": self.tags,
            "attributes": self.attributes
        }


class BaseAnalyzer:
    """Base class for image analyzers."""
    
    def __init__(self, settings: Dict[str, Any]):
        self.settings = settings
        self.confidence_threshold = float(settings.get('confidence_threshold', 0.3))
        self.extract_attributes = settings.get('extract_attributes', True)
    
    def analyze(self, image_url: str) -> List[str]:
        """
        Analyze an image and return predicted tags.
        
        Args:
            image_url: URL to the image
            
        Returns:
            List of predicted tag names
        """
        raise NotImplementedError
    
    def analyze_full(self, image_url: str) -> AnalysisResult:
        """
        Analyze an image and return both tags and performer attributes.
        
        Args:
            image_url: URL to the image
            
        Returns:
            AnalysisResult with tags and attributes
        """
        # Default implementation just returns tags
        result = AnalysisResult()
        result.tags = self.analyze(image_url)
        return result


class CLIPAnalyzer(BaseAnalyzer):
    """Analyzer using OpenAI's CLIP model for zero-shot classification."""
    
    def __init__(self, settings: Dict[str, Any]):
        super().__init__(settings)
        if not HAS_CLIP:
            raise ImportError("CLIP requires: pip install torch transformers")
        
        log.info("Loading CLIP model (this may take a moment)...")
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        
        # Flatten all candidate tags
        self.candidate_tags = []
        for category, tags in DEFAULT_TAG_CATEGORIES.items():
            self.candidate_tags.extend(tags)
        
        log.info(f"CLIP model loaded with {len(self.candidate_tags)} candidate tags")
    
    def analyze(self, image_url: str) -> List[str]:
        try:
            # Download image
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content)).convert("RGB")
            
            # Prepare text prompts (more descriptive prompts work better)
            text_prompts = [f"a photo of a person with {tag}" for tag in self.candidate_tags]
            
            # Process and run inference
            inputs = self.processor(
                text=text_prompts, 
                images=image, 
                return_tensors="pt", 
                padding=True
            )
            
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            # Get probabilities
            logits = outputs.logits_per_image[0]
            probs = torch.softmax(logits, dim=0).numpy()
            
            # Return tags above threshold
            results = []
            for i, (tag, prob) in enumerate(zip(self.candidate_tags, probs)):
                if prob >= self.confidence_threshold:
                    results.append(tag)
                    log.debug(f"  CLIP: {tag} = {prob:.3f}")
            
            return results
            
        except Exception as e:
            log.warning(f"CLIP analysis failed for {image_url}: {e}")
            return []


class OpenAIAnalyzer(BaseAnalyzer):
    """Analyzer using OpenAI's Vision API (GPT-4o)."""
    
    def __init__(self, settings: Dict[str, Any]):
        super().__init__(settings)
        if not HAS_OPENAI:
            raise ImportError("OpenAI requires: pip install openai")
        
        api_key = settings.get('api_key')
        if not api_key:
            raise ValueError("OpenAI API key is required. Set it in plugin settings.")
        
        self.client = openai.OpenAI(api_key=api_key)
        
        # Build the tag list for the prompt
        all_tags = []
        for category, tags in DEFAULT_TAG_CATEGORIES.items():
            all_tags.extend(tags)
        self.tag_list = ", ".join(all_tags)
    
    def analyze(self, image_url: str) -> List[str]:
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # Use gpt-4o for better results, gpt-4o-mini for cost
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an image analysis assistant. Analyze the image and return "
                            "ONLY a JSON array of applicable tags from the provided list. "
                            "Be accurate and conservative - only include tags you're confident about."
                        )
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Analyze this image and return applicable tags as a JSON array. Available tags: {self.tag_list}"
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_url}
                            }
                        ]
                    }
                ],
                max_tokens=200
            )
            
            # Parse the response
            content = response.choices[0].message.content.strip()
            
            # Try to extract JSON array from response
            if content.startswith('['):
                tags = json.loads(content)
            elif '[' in content and ']' in content:
                # Extract JSON from markdown code block or text
                start = content.index('[')
                end = content.rindex(']') + 1
                tags = json.loads(content[start:end])
            else:
                log.warning(f"Could not parse OpenAI response: {content}")
                return []
            
            # Validate tags against our list
            valid_tags = []
            all_candidate_tags = []
            for category, tag_list in DEFAULT_TAG_CATEGORIES.items():
                all_candidate_tags.extend(tag_list)
            
            for tag in tags:
                tag_lower = tag.lower().strip()
                if tag_lower in all_candidate_tags:
                    valid_tags.append(tag_lower)
            
            return valid_tags
            
        except Exception as e:
            log.warning(f"OpenAI analysis failed for {image_url}: {e}")
            return []


class OllamaAnalyzer(BaseAnalyzer):
    """
    Analyzer using Ollama with LLaVA or similar vision models.
    Runs locally - NO content restrictions, works with NSFW images.
    
    Setup:
        1. Install Ollama: https://ollama.ai
        2. Pull a vision model: ollama pull llava
        3. Ollama runs on http://localhost:11434 by default
    """
    
    def __init__(self, settings: Dict[str, Any]):
        super().__init__(settings)
        self.ollama_url = settings.get('ollama_url', 'http://localhost:11434')
        self.model = settings.get('ollama_model', 'llava')
        
        # Build the tag list for the prompt
        all_tags = []
        for category, tags in DEFAULT_TAG_CATEGORIES.items():
            all_tags.extend(tags)
        self.tag_list = ", ".join(all_tags)
        
        # Test connection
        try:
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = [m['name'] for m in response.json().get('models', [])]
                if not any(self.model in m for m in models):
                    log.warning(f"Model '{self.model}' not found. Available: {models}")
                    log.warning(f"Run: ollama pull {self.model}")
                else:
                    log.info(f"Ollama connected, using model: {self.model}")
            else:
                raise ConnectionError(f"Ollama returned status {response.status_code}")
        except requests.exceptions.ConnectionError:
            raise ConnectionError(
                f"Cannot connect to Ollama at {self.ollama_url}. "
                "Make sure Ollama is running (https://ollama.ai)"
            )
    
    def _download_image_b64(self, image_url: str) -> str:
        """Download image and convert to base64."""
        import base64
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        return base64.b64encode(response.content).decode('utf-8')
    
    def _call_ollama(self, prompt: str, image_b64: str) -> str:
        """Call Ollama API and return response text."""
        ollama_response = requests.post(
            f"{self.ollama_url}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "images": [image_b64],
                "stream": False,
                "options": {
                    "temperature": 0.1  # Lower = more consistent
                }
            },
            timeout=120  # Vision models can be slow
        )
        ollama_response.raise_for_status()
        return ollama_response.json().get('response', '').strip()

    def analyze(self, image_url: str) -> List[str]:
        try:
            image_b64 = self._download_image_b64(image_url)
            
            prompt = (
                f"Analyze this image of a person and return ONLY a JSON array of applicable tags. "
                f"Choose from these tags: {self.tag_list}\n\n"
                f"Return ONLY a JSON array like [\"tag1\", \"tag2\"]. No other text."
            )
            
            content = self._call_ollama(prompt, image_b64)
            
            # Parse JSON from response
            if content.startswith('['):
                tags = json.loads(content)
            elif '[' in content and ']' in content:
                start = content.index('[')
                end = content.rindex(']') + 1
                tags = json.loads(content[start:end])
            else:
                log.warning(f"Could not parse Ollama response: {content[:200]}")
                return []
            
            # Validate tags
            all_candidate_tags = []
            for category, tag_list in DEFAULT_TAG_CATEGORIES.items():
                all_candidate_tags.extend(tag_list)
            
            valid_tags = []
            for tag in tags:
                tag_lower = tag.lower().strip()
                if tag_lower in all_candidate_tags:
                    valid_tags.append(tag_lower)
            
            log.debug(f"  Ollama tags: {valid_tags}")
            return valid_tags
            
        except Exception as e:
            log.warning(f"Ollama analysis failed for {image_url}: {e}")
            return []
    
    def analyze_full(self, image_url: str) -> AnalysisResult:
        """
        Analyze image for both tags and performer attributes.
        
        Returns:
            AnalysisResult with tags and attributes like eye_color, hair_color, etc.
        """
        result = AnalysisResult()
        
        try:
            image_b64 = self._download_image_b64(image_url)
            
            # Build attribute options for prompt
            attr_instructions = []
            for attr_name, attr_config in PERFORMER_ATTRIBUTES.items():
                if "prompt_options" in attr_config:
                    options = ", ".join(attr_config["prompt_options"])
                    attr_instructions.append(f'"{attr_config["field"]}": choose from [{options}]')
                elif "prompt" in attr_config:
                    attr_instructions.append(f'"{attr_config["field"]}": {attr_config["prompt"]}')
            
            attr_format = "\n".join(attr_instructions)
            
            # Combined prompt for tags and attributes
            prompt = f"""Analyze this image of a person and return a JSON object with two parts:

1. "tags": An array of applicable tags from this list: {self.tag_list}

2. "attributes": An object with these performer attributes:
{attr_format}

Return ONLY valid JSON in this exact format:
{{
  "tags": ["tag1", "tag2"],
  "attributes": {{
    "gender": "value",
    "ethnicity": "value",
    "eye_color": "value",
    "hair_color": "value",
    "fake_tits": "value",
    "tattoos": "description or none",
    "piercings": "description or none",
    "measurements": "estimate or unknown"
  }}
}}

Be accurate. If you cannot determine an attribute, use "unknown" or omit it.
Return ONLY the JSON, no other text."""

            content = self._call_ollama(prompt, image_b64)
            log.debug(f"Ollama full response: {content[:500]}")
            
            # Parse JSON from response
            parsed = None
            if content.startswith('{'):
                parsed = json.loads(content)
            elif '{' in content and '}' in content:
                # Extract JSON from text
                start = content.index('{')
                end = content.rindex('}') + 1
                parsed = json.loads(content[start:end])
            
            if not parsed:
                log.warning(f"Could not parse Ollama response as JSON")
                # Fall back to simple tag analysis
                result.tags = self.analyze(image_url)
                return result
            
            # Extract tags
            if 'tags' in parsed:
                all_candidate_tags = []
                for category, tag_list in DEFAULT_TAG_CATEGORIES.items():
                    all_candidate_tags.extend(tag_list)
                
                for tag in parsed['tags']:
                    tag_lower = str(tag).lower().strip()
                    if tag_lower in all_candidate_tags:
                        result.tags.append(tag_lower)
            
            # Extract attributes
            if 'attributes' in parsed:
                attrs = parsed['attributes']
                for attr_name, attr_config in PERFORMER_ATTRIBUTES.items():
                    field = attr_config['field']
                    if field in attrs:
                        value = attrs[field]
                        # Clean up and validate
                        if value and str(value).lower() not in ['unknown', 'null', 'none', 'n/a', '']:
                            # Handle gender enum conversion
                            if field == 'gender':
                                value = self._normalize_gender(value)
                            result.attributes[field] = str(value).strip()
            
            log.debug(f"  Ollama full result - tags: {result.tags}, attrs: {result.attributes}")
            return result
            
        except json.JSONDecodeError as e:
            log.warning(f"JSON parse error in Ollama response: {e}")
            result.tags = self.analyze(image_url)
            return result
        except Exception as e:
            log.warning(f"Ollama full analysis failed for {image_url}: {e}")
            return result
    
    def _normalize_gender(self, value: str) -> Optional[str]:
        """Convert gender string to Stash GenderEnum value."""
        value = value.lower().strip()
        mapping = {
            'male': 'MALE',
            'man': 'MALE',
            'female': 'FEMALE',
            'woman': 'FEMALE',
            'transgender male': 'TRANSGENDER_MALE',
            'trans male': 'TRANSGENDER_MALE',
            'ftm': 'TRANSGENDER_MALE',
            'transgender female': 'TRANSGENDER_FEMALE',
            'trans female': 'TRANSGENDER_FEMALE',
            'mtf': 'TRANSGENDER_FEMALE',
            'trans': 'TRANSGENDER_FEMALE',  # Default assumption
            'intersex': 'INTERSEX',
            'non-binary': 'NON_BINARY',
            'nonbinary': 'NON_BINARY',
            'enby': 'NON_BINARY',
        }
        return mapping.get(value)


class SimpleAnalyzer(BaseAnalyzer):
    """
    Simple analyzer that doesn't require ML - just returns empty results.
    Useful for testing the plugin infrastructure.
    """
    
    def analyze(self, image_url: str) -> List[str]:
        log.debug(f"SimpleAnalyzer: would analyze {image_url}")
        return []


# =============================================================================
# Main Plugin Logic
# =============================================================================

def get_analyzer(settings: Dict[str, Any]) -> BaseAnalyzer:
    """
    Get the appropriate analyzer based on available dependencies and settings.
    
    Priority for NSFW content:
    1. Ollama (local, no restrictions, best for adult content)
    2. CLIP (local, no restrictions)
    3. OpenAI (will reject explicit content - only for SFW images)
    """
    use_ollama = settings.get('use_ollama', True)  # Default to Ollama for NSFW
    ollama_url = settings.get('ollama_url', 'http://localhost:11434')
    api_key = settings.get('api_key')
    
    # Try Ollama first (best for NSFW content)
    if use_ollama and HAS_OLLAMA:
        try:
            log.info("Attempting to use Ollama (NSFW-friendly, local)")
            return OllamaAnalyzer(settings)
        except ConnectionError as e:
            log.warning(f"Ollama not available: {e}")
        except Exception as e:
            log.warning(f"Ollama initialization failed: {e}")
    
    # Fall back to CLIP (also local, no restrictions)
    if HAS_CLIP and HAS_PIL:
        log.info("Using CLIP analyzer (local, NSFW-friendly)")
        return CLIPAnalyzer(settings)
    
    # OpenAI as last resort (NOTE: will reject explicit NSFW content!)
    if api_key and HAS_OPENAI:
        log.warning("Using OpenAI Vision - NOTE: This will REJECT explicit NSFW images!")
        log.warning("For adult content, install Ollama (https://ollama.ai) and run: ollama pull llava")
        return OpenAIAnalyzer(settings)
    
    # No backend available
    log.error("No ML backend available!")
    log.error("For NSFW content, install Ollama: https://ollama.ai")
    log.error("Then run: ollama pull llava")
    log.error("Or install CLIP: pip install torch transformers")
    return SimpleAnalyzer(settings)


def process_performer(
    stash: StashInterface, 
    analyzer: BaseAnalyzer,
    performer: Dict,
    settings: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Process a single performer: analyze their images and suggest/apply tags.
    
    Returns:
        Dict with results including suggested tags and status
    """
    performer_id = performer['id']
    performer_name = performer['name']
    existing_tags = {t['name'].lower(): t['id'] for t in performer.get('tags', [])}
    
    log.info(f"Processing performer: {performer_name} (ID: {performer_id})")
    
    max_images = int(settings.get('max_images_per_performer', 5))
    dry_run = settings.get('dry_run', False)
    
    # Collect images to analyze
    images_to_analyze = []
    
    # 1. Get performer's profile image
    profile_url = stash.get_performer_profile_image(performer)
    if profile_url:
        images_to_analyze.append(profile_url)
    
    # 2. Get associated images from the library
    associated_images = stash.get_images_for_performer(performer_id, limit=max_images)
    for img in associated_images:
        if img.get('paths', {}).get('image'):
            images_to_analyze.append(img['paths']['image'])
    
    if not images_to_analyze:
        log.info(f"  No images found for {performer_name}")
        return {"performer": performer_name, "status": "no_images", "tags_added": []}
    
    log.info(f"  Analyzing {len(images_to_analyze)} images...")
    
    # Analyze all images and collect tags
    all_suggested_tags: Dict[str, int] = {}  # tag -> count of times seen
    
    for i, image_url in enumerate(images_to_analyze[:max_images]):
        log.debug(f"  Analyzing image {i+1}/{len(images_to_analyze)}")
        try:
            tags = analyzer.analyze(image_url)
            for tag in tags:
                all_suggested_tags[tag] = all_suggested_tags.get(tag, 0) + 1
        except Exception as e:
            log.warning(f"  Failed to analyze image: {e}")
    
    # Filter to tags that appeared in multiple images (if we have multiple)
    min_occurrences = 1 if len(images_to_analyze) <= 2 else 2
    confident_tags = [
        tag for tag, count in all_suggested_tags.items() 
        if count >= min_occurrences
    ]
    
    # Filter out tags the performer already has
    new_tags = [tag for tag in confident_tags if tag.lower() not in existing_tags]
    
    if not new_tags:
        log.info(f"  No new tags to add for {performer_name}")
        return {"performer": performer_name, "status": "no_new_tags", "tags_added": []}
    
    log.info(f"  Suggested new tags: {new_tags}")
    
    if dry_run:
        log.info(f"  [DRY RUN] Would add tags: {new_tags}")
        return {"performer": performer_name, "status": "dry_run", "tags_suggested": new_tags}
    
    # Apply the new tags
    try:
        # Get or create tag IDs
        new_tag_ids = [stash.find_or_create_tag(tag) for tag in new_tags]
        
        # Combine with existing tags
        all_tag_ids = list(existing_tags.values()) + new_tag_ids
        
        # Update performer
        stash.update_performer_tags(performer_id, all_tag_ids)
        
        log.info(f"  ✓ Added tags to {performer_name}: {new_tags}")
        return {"performer": performer_name, "status": "updated", "tags_added": new_tags}
        
    except Exception as e:
        log.error(f"  Failed to update {performer_name}: {e}")
        return {"performer": performer_name, "status": "error", "error": str(e)}


def run_all_performers(stash: StashInterface, analyzer: BaseAnalyzer, settings: Dict[str, Any]):
    """Process all performers in the library."""
    log.info("Fetching all performers...")
    
    page = 1
    per_page = 50
    total_processed = 0
    results = []
    
    while True:
        result = stash.get_all_performers(page=page, per_page=per_page)
        performers = result['performers']
        total = result['count']
        
        if not performers:
            break
        
        for i, performer in enumerate(performers):
            total_processed += 1
            progress = total_processed / total
            log.progress(progress)
            
            result = process_performer(stash, analyzer, performer, settings)
            results.append(result)
        
        if total_processed >= total:
            break
        
        page += 1
    
    log.info(f"Processed {total_processed} performers")
    
    # Summary
    updated = sum(1 for r in results if r['status'] == 'updated')
    no_images = sum(1 for r in results if r['status'] == 'no_images')
    no_new = sum(1 for r in results if r['status'] == 'no_new_tags')
    errors = sum(1 for r in results if r['status'] == 'error')
    
    log.info(f"Summary: {updated} updated, {no_new} unchanged, {no_images} no images, {errors} errors")


def run_single_performer(stash: StashInterface, analyzer: BaseAnalyzer, settings: Dict[str, Any], performer_id: str):
    """Process a single performer by ID."""
    performer = stash.get_performer_by_id(performer_id)
    
    if not performer:
        log.error(f"Performer not found with ID: {performer_id}")
        return {"error": "Performer not found"}
    
    result = process_performer(stash, analyzer, performer, settings)
    log.info(f"Result: {json.dumps(result, indent=2)}")
    return result


def analyze_single_image(
    stash: StashInterface,
    analyzer: BaseAnalyzer,
    image_url: str,
    performer_id: Optional[str] = None,
    extract_attributes: bool = True
) -> Dict[str, Any]:
    """
    Analyze a single image and return suggested tags AND performer attributes.
    
    This is the UI-triggered mode for analyzing a specific image.
    
    Args:
        stash: Stash interface
        analyzer: Image analyzer
        image_url: URL to the image
        performer_id: Optional performer ID for context
        extract_attributes: Whether to extract performer attributes (eye color, etc)
        
    Returns:
        Dict with suggested_tags, suggested_attributes, and performer info
    """
    log.info(f"Analyzing single image: {image_url}")
    
    # Get performer info if provided
    performer = None
    existing_tags = []
    empty_fields = []  # Fields that can be populated
    
    if performer_id:
        performer = stash.get_performer_by_id(performer_id)
        if performer:
            existing_tags = [t['name'].lower() for t in performer.get('tags', [])]
            log.info(f"Performer: {performer['name']} (existing tags: {len(existing_tags)})")
            
            # Check which fields are empty and can be populated
            for attr_name, attr_config in PERFORMER_ATTRIBUTES.items():
                field = attr_config['field']
                current_value = performer.get(field)
                if not current_value or str(current_value).strip() == '':
                    empty_fields.append(field)
            
            log.info(f"Empty fields that can be populated: {empty_fields}")
    
    # Analyze the image
    try:
        # Use full analysis if we want attributes and analyzer supports it
        if extract_attributes and hasattr(analyzer, 'analyze_full'):
            analysis = analyzer.analyze_full(image_url)
            suggested_tags = analysis.tags
            suggested_attrs = analysis.attributes
        else:
            suggested_tags = analyzer.analyze(image_url)
            suggested_attrs = {}
        
        log.info(f"Suggested tags: {suggested_tags}")
        log.info(f"Suggested attributes: {suggested_attrs}")
        
        # Filter out existing tags
        new_tags = [tag for tag in suggested_tags if tag.lower() not in existing_tags]
        
        # Filter attributes to only include empty fields
        new_attrs = {}
        for field, value in suggested_attrs.items():
            if field in empty_fields and value:
                new_attrs[field] = value
        
        result = {
            "status": "success",
            "image_url": image_url,
            "suggested_tags": suggested_tags,
            "new_tags": new_tags,
            "existing_tags": existing_tags,
            "suggested_attributes": suggested_attrs,
            "new_attributes": new_attrs,  # Only fields that are currently empty
            "empty_fields": empty_fields,
        }
        
        if performer:
            result["performer_id"] = performer_id
            result["performer_name"] = performer['name']
        
        log.info(f"Analysis complete. {len(new_tags)} new tags, {len(new_attrs)} new attributes suggested.")
        return result
        
    except Exception as e:
        log.error(f"Failed to analyze image: {e}")
        import traceback
        log.error(traceback.format_exc())
        return {"status": "error", "error": str(e)}


def apply_tags_to_performer(
    stash: StashInterface,
    performer_id: str,
    tags: List[str]
) -> Dict[str, Any]:
    """
    Apply a list of tags to a performer.
    
    Creates tags if they don't exist.
    
    Args:
        stash: Stash interface
        performer_id: Performer ID
        tags: List of tag names to apply
        
    Returns:
        Result dict with status
    """
    log.info(f"Applying {len(tags)} tags to performer {performer_id}")
    
    # Get current performer
    performer = stash.get_performer_by_id(performer_id)
    if not performer:
        return {"status": "error", "error": "Performer not found"}
    
    performer_name = performer['name']
    existing_tag_ids = [t['id'] for t in performer.get('tags', [])]
    
    # Get or create each tag
    new_tag_ids = []
    for tag_name in tags:
        try:
            tag_id = stash.find_or_create_tag(tag_name)
            if tag_id not in existing_tag_ids:
                new_tag_ids.append(tag_id)
                log.info(f"  Adding tag: {tag_name}")
        except Exception as e:
            log.warning(f"  Failed to create tag '{tag_name}': {e}")
    
    if not new_tag_ids:
        log.info("No new tags to add")
        return {"status": "no_change", "performer": performer_name}
    
    # Update performer with all tags
    all_tag_ids = existing_tag_ids + new_tag_ids
    
    try:
        stash.update_performer_tags(performer_id, all_tag_ids)
        log.info(f"✓ Applied {len(new_tag_ids)} new tags to {performer_name}")
        return {
            "status": "success",
            "performer": performer_name,
            "tags_added": tags,
            "count": len(new_tag_ids)
        }
    except Exception as e:
        log.error(f"Failed to update performer: {e}")
        return {"status": "error", "error": str(e)}


def apply_attributes_to_performer(
    stash: StashInterface,
    performer_id: str,
    attributes: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Apply attributes to a performer, but ONLY if the field is currently empty.
    
    Args:
        stash: Stash interface
        performer_id: Performer ID
        attributes: Dict of field names to values (e.g., {"eye_color": "blue"})
        
    Returns:
        Result dict with status and fields updated
    """
    log.info(f"Applying attributes to performer {performer_id}: {attributes}")
    
    # Get current performer
    performer = stash.get_performer_by_id(performer_id)
    if not performer:
        return {"status": "error", "error": "Performer not found"}
    
    performer_name = performer['name']
    
    # Filter to only update empty fields
    fields_to_update = {}
    skipped_fields = []
    
    for field, new_value in attributes.items():
        if not new_value:
            continue
            
        current_value = performer.get(field)
        
        # Check if field is empty (None, empty string, etc.)
        is_empty = current_value is None or str(current_value).strip() == ''
        
        if is_empty:
            fields_to_update[field] = new_value
            log.info(f"  Will set {field} = {new_value}")
        else:
            skipped_fields.append(field)
            log.info(f"  Skipping {field} (already has value: {current_value})")
    
    if not fields_to_update:
        log.info("No empty fields to update")
        return {
            "status": "no_change",
            "performer": performer_name,
            "skipped_fields": skipped_fields,
            "reason": "All fields already have values"
        }
    
    # Apply the updates
    try:
        stash.update_performer_fields(performer_id, fields_to_update)
        log.info(f"✓ Updated {len(fields_to_update)} fields for {performer_name}")
        return {
            "status": "success",
            "performer": performer_name,
            "fields_updated": fields_to_update,
            "skipped_fields": skipped_fields,
            "count": len(fields_to_update)
        }
    except Exception as e:
        log.error(f"Failed to update performer: {e}")
        return {"status": "error", "error": str(e)}


def apply_all_to_performer(
    stash: StashInterface,
    performer_id: str,
    tags: Optional[List[str]] = None,
    attributes: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Apply both tags and attributes to a performer.
    
    Attributes are only applied if the field is currently empty.
    
    Args:
        stash: Stash interface
        performer_id: Performer ID
        tags: Optional list of tag names to apply
        attributes: Optional dict of field names to values
        
    Returns:
        Combined result dict
    """
    result = {
        "status": "success",
        "performer_id": performer_id,
        "tags_result": None,
        "attributes_result": None
    }
    
    # Apply tags
    if tags:
        tags_result = apply_tags_to_performer(stash, performer_id, tags)
        result["tags_result"] = tags_result
        if tags_result.get("status") == "error":
            result["status"] = "partial_error"
    
    # Apply attributes (only empty fields)
    if attributes:
        attrs_result = apply_attributes_to_performer(stash, performer_id, attributes)
        result["attributes_result"] = attrs_result
        if attrs_result.get("status") == "error":
            result["status"] = "partial_error"
    
    return result


def analyze_performer_images(
    stash: StashInterface,
    analyzer: BaseAnalyzer,
    performer_id: str,
    settings: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Analyze multiple images for a performer and return aggregated suggestions.
    
    Args:
        stash: Stash interface
        analyzer: Image analyzer
        performer_id: Performer ID
        settings: Plugin settings
        
    Returns:
        Dict with aggregated suggested tags
    """
    performer = stash.get_performer_by_id(performer_id)
    if not performer:
        return {"status": "error", "error": "Performer not found"}
    
    performer_name = performer['name']
    existing_tags = {t['name'].lower(): t['id'] for t in performer.get('tags', [])}
    
    log.info(f"Analyzing images for: {performer_name}")
    
    max_images = int(settings.get('max_images_per_performer', 5))
    
    # Collect images
    images_to_analyze = []
    
    # Profile image
    profile_url = stash.get_performer_profile_image(performer)
    if profile_url:
        images_to_analyze.append(profile_url)
    
    # Library images
    associated_images = stash.get_images_for_performer(performer_id, limit=max_images)
    for img in associated_images:
        if img.get('paths', {}).get('image'):
            images_to_analyze.append(img['paths']['image'])
    
    if not images_to_analyze:
        return {"status": "no_images", "performer": performer_name}
    
    log.info(f"Analyzing {len(images_to_analyze)} images...")
    
    # Analyze all images
    all_suggested: Dict[str, int] = {}
    
    for i, url in enumerate(images_to_analyze[:max_images]):
        log.progress((i + 1) / len(images_to_analyze))
        log.debug(f"Analyzing image {i+1}/{len(images_to_analyze)}")
        
        try:
            tags = analyzer.analyze(url)
            for tag in tags:
                all_suggested[tag] = all_suggested.get(tag, 0) + 1
        except Exception as e:
            log.warning(f"Failed to analyze image: {e}")
    
    # Get confident tags (appeared multiple times)
    min_occurrences = 1 if len(images_to_analyze) <= 2 else 2
    confident_tags = [
        tag for tag, count in all_suggested.items()
        if count >= min_occurrences
    ]
    
    # Filter existing
    new_tags = [tag for tag in confident_tags if tag.lower() not in existing_tags]
    
    log.info(f"Analysis complete. Suggested {len(confident_tags)} tags, {len(new_tags)} are new.")
    
    return {
        "status": "success",
        "performer_id": performer_id,
        "performer_name": performer_name,
        "suggested_tags": confident_tags,
        "new_tags": new_tags,
        "existing_tags": list(existing_tags.keys()),
        "images_analyzed": len(images_to_analyze)
    }


def read_json_input() -> Dict:
    """Read JSON input from stdin (provided by Stash)."""
    input_str = sys.stdin.read()
    return json.loads(input_str)


def main():
    """Main entry point for the plugin."""
    output = {"output": "ok"}
    
    try:
        # Read input from Stash
        plugin_input = read_json_input()
        log.debug(f"Plugin input: {json.dumps(plugin_input, indent=2)}")
        
        # Extract connection info and args
        server_connection = plugin_input.get('server_connection', {})
        args = plugin_input.get('args', {})
        mode = args.get('mode', 'all')
        
        # Initialize Stash interface
        stash = StashInterface(server_connection)
        
        # Get plugin settings from configuration
        settings = {}
        try:
            config = stash.call_graphql("""
                query Configuration {
                    configuration {
                        plugins
                    }
                }
            """)
            plugins_config = config.get('configuration', {}).get('plugins', {})
            settings = plugins_config.get(PLUGIN_ID, {})
        except Exception as e:
            log.debug(f"Could not load plugin settings: {e}")
        
        # Override with any inline settings from args
        for key in ['api_key', 'confidence_threshold', 'max_images_per_performer', 
                    'dry_run', 'use_ollama', 'ollama_url', 'ollama_model']:
            if key in args:
                settings[key] = args[key]
        
        # Set defaults
        settings.setdefault('confidence_threshold', 0.3)
        settings.setdefault('max_images_per_performer', 5)
        settings.setdefault('dry_run', False)
        settings.setdefault('use_ollama', True)
        settings.setdefault('ollama_url', 'http://localhost:11434')
        settings.setdefault('ollama_model', 'llava')
        
        log.info(f"Starting Performer Auto-Tagger (mode: {mode})")
        log.debug(f"Settings: {json.dumps(settings, indent=2)}")
        
        # Handle different modes
        if mode == 'analyze_image':
            # Analyze a single image (triggered from UI)
            image_url = args.get('image_url')
            performer_id = args.get('performer_id')
            
            if not image_url:
                output["error"] = "image_url is required"
            else:
                analyzer = get_analyzer(settings)
                result = analyze_single_image(stash, analyzer, image_url, performer_id)
                output["output"] = result
        
        elif mode == 'analyze_performer':
            # Analyze all images for a performer (triggered from UI)
            performer_id = args.get('performer_id')
            
            if not performer_id:
                output["error"] = "performer_id is required"
            else:
                analyzer = get_analyzer(settings)
                result = analyze_performer_images(stash, analyzer, performer_id, settings)
                output["output"] = result
        
        elif mode == 'apply_tags':
            # Apply selected tags to a performer (triggered from UI)
            performer_id = args.get('performer_id')
            tags = args.get('tags', [])
            
            if not performer_id:
                output["error"] = "performer_id is required"
            elif not tags:
                output["error"] = "tags list is required"
            else:
                result = apply_tags_to_performer(stash, performer_id, tags)
                output["output"] = result
        
        elif mode == 'apply_attributes':
            # Apply suggested attributes to a performer (only empty fields)
            performer_id = args.get('performer_id')
            attributes = args.get('attributes', {})
            
            if not performer_id:
                output["error"] = "performer_id is required"
            elif not attributes:
                output["error"] = "attributes dict is required"
            else:
                result = apply_attributes_to_performer(stash, performer_id, attributes)
                output["output"] = result
        
        elif mode == 'apply_all':
            # Apply both tags and attributes to a performer
            performer_id = args.get('performer_id')
            tags = args.get('tags', [])
            attributes = args.get('attributes', {})
            
            if not performer_id:
                output["error"] = "performer_id is required"
            else:
                result = apply_all_to_performer(stash, performer_id, tags, attributes)
                output["output"] = result
        
        elif mode == 'all':
            # Process all performers (batch mode)
            analyzer = get_analyzer(settings)
            run_all_performers(stash, analyzer, settings)
        
        elif mode == 'single':
            # Process a single performer
            performer_id = args.get('performer_id')
            if not performer_id:
                output["error"] = "performer_id is required"
            else:
                analyzer = get_analyzer(settings)
                result = run_single_performer(stash, analyzer, settings, performer_id)
                output["output"] = result
        
        elif mode == 'preview':
            # Preview mode (dry run)
            settings['dry_run'] = True
            analyzer = get_analyzer(settings)
            run_all_performers(stash, analyzer, settings)
        
        else:
            log.error(f"Unknown mode: {mode}")
            output["error"] = f"Unknown mode: {mode}"
        
        log.info("Performer Auto-Tagger completed")
        
    except Exception as e:
        log.error(f"Plugin error: {e}")
        import traceback
        log.error(traceback.format_exc())
        output["error"] = str(e)
    
    # Output result
    print(json.dumps(output))


if __name__ == "__main__":
    main()

