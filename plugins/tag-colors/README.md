# Tag Colors by Parent

A Stash plugin that colors tag pills based on their parent tag hierarchy.

## Features

- Tags that descend from **"Action"** are colored **red**
- Tags that descend from **"People"** are colored **green**
- Tags that descend from **"Scene"** are colored **purple**

The parent tags themselves are also colored (e.g., the "Action" tag will be red).

## How It Works

1. On load, the plugin queries all tags and their parent relationships
2. It builds an ancestry map to determine which tags descend from which parent
3. It patches the `TagLink` component to add CSS classes based on ancestry
4. Custom CSS applies the colors

## Priority

If a tag descends from multiple configured parents (e.g., both "Action" and "People"), the first match wins based on this priority order:

1. Action (red)
2. People (green)
3. Scene (purple)

## Customization

To change the parent tags or colors, edit:

- `tagColors.js` - Modify `TAG_COLOR_CONFIG` to change which parent tags trigger coloring
- `tagColors.css` - Modify the color values to change the appearance

### Example: Adding a new color category

In `tagColors.js`, add to `TAG_COLOR_CONFIG`:

```javascript
const TAG_COLOR_CONFIG = {
  action: "tag-ancestor-action",
  people: "tag-ancestor-people",
  scene: "tag-ancestor-scene",
  location: "tag-ancestor-location", // Add new category
};
```

In `tagColors.css`, add the new styles:

```css
/* Location tags - Orange */
.tag-item.tag-ancestor-location,
.tag-item.tag-ancestor-location.tag-link {
  background-color: #fd7e14 !important;
  border-color: #fd7e14 !important;
}

.tag-item.tag-ancestor-location a,
.tag-item.tag-ancestor-location.tag-link a {
  color: #fff !important;
}
```

## Installation

1. Copy the `tag-colors` folder to your Stash plugins directory
2. Restart Stash or click "Reload Plugins" in Settings > Plugins
3. Enable the "Tag Colors by Parent" plugin

## Requirements

- Stash with UI plugin support
- Tags must be organized in a hierarchy (child tags must have parent tags set)




