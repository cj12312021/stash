# build-plugins.ps1
# Build script for stash plugin submodules
#
# Usage:
#   .\scripts\build-plugins.ps1              # Build all plugins
#   .\scripts\build-plugins.ps1 -Plugin stash-react-plugin  # Build specific plugin

param(
    [string]$Plugin = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$PluginsDir = Join-Path $RootDir "plugins"

Write-Host "=== Stash Plugin Builder ===" -ForegroundColor Cyan

function Build-Plugin {
    param([string]$PluginPath)
    
    $PluginName = Split-Path -Leaf $PluginPath
    $PackageJson = Join-Path $PluginPath "package.json"
    
    if (-not (Test-Path $PackageJson)) {
        Write-Host "  Skipping $PluginName (no package.json)" -ForegroundColor Gray
        return
    }
    
    Write-Host "`nBuilding: $PluginName" -ForegroundColor Yellow
    
    Push-Location $PluginPath
    try {
        # Check if node_modules exists
        $NodeModules = Join-Path $PluginPath "node_modules"
        if (-not (Test-Path $NodeModules)) {
            Write-Host "  Installing dependencies..." -ForegroundColor Gray
            yarn install --frozen-lockfile
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install dependencies for $PluginName"
            }
        }
        
        # Build the plugin
        Write-Host "  Building..." -ForegroundColor Gray
        yarn build
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to build $PluginName"
        }
        
        Write-Host "  Successfully built $PluginName" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Initialize submodules if needed
Write-Host "`nChecking submodules..." -ForegroundColor Cyan
Push-Location $RootDir
git submodule update --init --recursive
Pop-Location

if ($Plugin -ne "") {
    # Build specific plugin
    $PluginPath = Join-Path $PluginsDir $Plugin
    if (-not (Test-Path $PluginPath)) {
        Write-Host "Plugin not found: $Plugin" -ForegroundColor Red
        exit 1
    }
    Build-Plugin -PluginPath $PluginPath
}
else {
    # Build all plugins with package.json
    Get-ChildItem -Path $PluginsDir -Directory | ForEach-Object {
        Build-Plugin -PluginPath $_.FullName
    }
}

Write-Host "`n=== Build Complete ===" -ForegroundColor Cyan

