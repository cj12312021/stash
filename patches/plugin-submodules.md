# Plugin Submodules

This document describes the git submodule configuration for external plugins managed within the stash fork.

## Overview

Some plugins are maintained as separate repositories but integrated into the stash fork via git submodules. This allows:

- **Independent versioning**: Plugins have their own release cycle
- **Separate development**: Plugins can be developed/tested standalone
- **Easy updates**: Pull latest plugin changes without affecting main fork
- **Clean separation**: Plugin code doesn't pollute fork's commit history

---

## Configured Submodules

### stash-react-plugin

| Property | Value |
|----------|-------|
| **Path** | `plugins/stash-react-plugin` |
| **Repository** | `https://github.com/cj12312021/stash-react-plugin.git` |
| **Purpose** | Enhanced performer details panel with secondary image support |
| **Build Required** | Yes (`yarn build`) |
| **Output** | `dist/react-component.{js,css,yml}` |

#### Features
- Secondary performer image support (expanded/collapsed/toggle modes)
- Enhanced external links button with site-specific icons
- Performer stats display (trending indicators)
- Custom performer details panel extensions

#### Settings (via Stash UI)
- `imageMode`: Display mode for secondary images (0=expanded, 1=collapsed, 2=toggle)

---

## Setup Guide

### Initial Clone (New Developer)

After cloning the stash fork, initialize submodules:

```bash
git clone https://github.com/cj12312021/stash.git
cd stash
git submodule update --init --recursive
```

### Building Plugins

Use the build script to build all plugin submodules:

```powershell
# Windows (PowerShell)
.\scripts\build-plugins.ps1

# Build specific plugin
.\scripts\build-plugins.ps1 -Plugin stash-react-plugin
```

```bash
# Linux/macOS
./scripts/build-plugins.sh

# Build specific plugin
./scripts/build-plugins.sh stash-react-plugin
```

### Manual Build

```bash
cd plugins/stash-react-plugin
yarn install --frozen-lockfile
yarn build
```

---

## Working with Submodules

### Updating Plugin to Latest

```bash
cd plugins/stash-react-plugin
git pull origin main
cd ../..
git add plugins/stash-react-plugin
git commit -m "Update stash-react-plugin to latest"
```

### Making Changes to Plugin

1. **Option A**: Make changes in the submodule directly
   ```bash
   cd plugins/stash-react-plugin
   # Make changes, commit, push to plugin repo
   git add .
   git commit -m "Your changes"
   git push origin main
   
   # Update parent reference
   cd ../..
   git add plugins/stash-react-plugin
   git commit -m "Update stash-react-plugin reference"
   ```

2. **Option B**: Make changes in the standalone plugin repo
   ```bash
   cd "C:\Users\Admin\GitHub Projects\stash-react-plugin"
   # Make changes, commit, push
   
   # Then update submodule in stash fork
   cd "C:\Users\Admin\Documents\GitHub\stash"
   cd plugins/stash-react-plugin
   git pull origin main
   cd ../..
   git add plugins/stash-react-plugin
   git commit -m "Update stash-react-plugin"
   ```

### Viewing Submodule Status

```bash
git submodule status
```

### Checking for Submodule Updates

```bash
git submodule update --remote --merge
```

---

## CI/CD Integration

When building stash in CI, ensure submodules are initialized and plugins are built:

```yaml
# GitHub Actions example
steps:
  - uses: actions/checkout@v4
    with:
      submodules: recursive
  
  - name: Build plugins
    run: |
      cd plugins/stash-react-plugin
      yarn install --frozen-lockfile
      yarn build
```

---

## Troubleshooting

### Submodule not initialized
```bash
git submodule update --init --recursive
```

### Submodule shows as modified (no actual changes)
```bash
git submodule update --force
```

### Plugin dist/ folder missing
The `dist/` folder is gitignored and must be built locally:
```bash
cd plugins/stash-react-plugin
yarn install --frozen-lockfile
yarn build
```

### Stash doesn't load plugin
1. Verify `dist/react-component.yml` exists
2. Check Stash Settings > Plugins > Reload Plugins
3. Ensure plugin is enabled in plugin list

### Log warnings about node_modules yml files
When running stash in development with `node_modules` present, you may see log warnings about invalid plugin yml files from node_modules. This is harmless - stash logs the error and continues. The actual plugin will still load correctly.

**To avoid this in production:**
Only deploy the `dist/` folder contents, not the entire submodule:
```bash
# For deployment - copy only the built plugin
cp -r plugins/stash-react-plugin/dist/* /path/to/stash/plugins/react-component/
```

---

## Related Files

- `.gitmodules` - Submodule configuration
- `scripts/build-plugins.ps1` - Windows build script
- `scripts/build-plugins.sh` - Unix build script
- `plugins/stash-react-plugin/` - Plugin submodule

