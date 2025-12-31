#!/bin/bash
# build-plugins.sh
# Build script for stash plugin submodules
#
# Usage:
#   ./scripts/build-plugins.sh              # Build all plugins
#   ./scripts/build-plugins.sh stash-react-plugin  # Build specific plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGINS_DIR="$ROOT_DIR/plugins"

echo "=== Stash Plugin Builder ==="

build_plugin() {
    local plugin_path="$1"
    local plugin_name="$(basename "$plugin_path")"
    local package_json="$plugin_path/package.json"
    
    if [ ! -f "$package_json" ]; then
        echo "  Skipping $plugin_name (no package.json)"
        return
    fi
    
    echo ""
    echo "Building: $plugin_name"
    
    pushd "$plugin_path" > /dev/null
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo "  Installing dependencies..."
        yarn install --frozen-lockfile
    fi
    
    # Build the plugin
    echo "  Building..."
    yarn build
    
    echo "  Successfully built $plugin_name"
    
    popd > /dev/null
}

# Initialize submodules if needed
echo ""
echo "Checking submodules..."
pushd "$ROOT_DIR" > /dev/null
git submodule update --init --recursive
popd > /dev/null

if [ -n "$1" ]; then
    # Build specific plugin
    plugin_path="$PLUGINS_DIR/$1"
    if [ ! -d "$plugin_path" ]; then
        echo "Plugin not found: $1"
        exit 1
    fi
    build_plugin "$plugin_path"
else
    # Build all plugins with package.json
    for plugin_dir in "$PLUGINS_DIR"/*/; do
        if [ -d "$plugin_dir" ]; then
            build_plugin "$plugin_dir"
        fi
    done
fi

echo ""
echo "=== Build Complete ==="

