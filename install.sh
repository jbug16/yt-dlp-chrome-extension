#!/bin/bash
# install.sh — Set up the yt-dlp Chrome extension native messaging host
#
# This script:
#   1. Checks for required dependencies (yt-dlp, python3, ffmpeg)
#   2. Generates a shell wrapper that Chrome will launch
#   3. Configures the native messaging host manifest
#   4. Installs the manifest to Chrome's NativeMessagingHosts directory
#
# Run this once after cloning the repo, and again if the extension ID changes.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.ytdlp.downloader"
HOST_SCRIPT="$SCRIPT_DIR/yt_dlp_host.py"
HOST_WRAPPER="$SCRIPT_DIR/yt_dlp_host_wrapper.sh"
CHROME_NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo "=== yt-dlp Chrome Extension Installer ==="
echo ""

# --- Dependency checks ---

check_dep() {
    local name="$1" install_cmd="$2"
    if command -v "$name" &>/dev/null; then
        echo "  [OK] $name: $(command -v "$name")"
        return 0
    else
        echo "  [!!] $name not found."
        if [[ -n "$install_cmd" ]]; then
            read -rp "  Install via Homebrew? (y/n) " yn
            if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
                eval "$install_cmd"
                return 0
            fi
        fi
        return 1
    fi
}

echo "Checking dependencies..."
check_dep "python3" "" || { echo "Error: python3 is required."; exit 1; }
check_dep "yt-dlp" "brew install yt-dlp" || { echo "Error: yt-dlp is required."; exit 1; }
check_dep "ffmpeg" "brew install ffmpeg" || echo "  Warning: ffmpeg not found — video+audio merging won't work."
echo ""

# --- Detect paths ---

PYTHON3_PATH="$(command -v python3)"
HOMEBREW_PREFIX="$(brew --prefix 2>/dev/null || echo "/opt/homebrew")"

# --- Generate wrapper script ---
# Chrome launches native messaging hosts without a login shell, so PATH is minimal.
# This wrapper ensures Homebrew binaries (yt-dlp, ffmpeg) are discoverable.

cat > "$HOST_WRAPPER" << WRAPPER
#!/bin/bash
export PATH="${HOMEBREW_PREFIX}/bin:\$PATH"
exec "$PYTHON3_PATH" -u "$HOST_SCRIPT" "\$@"
WRAPPER
chmod +x "$HOST_WRAPPER"
echo "[OK] Generated host wrapper: $HOST_WRAPPER"

# --- Make host script executable ---

chmod +x "$HOST_SCRIPT"
echo "[OK] Made yt_dlp_host.py executable"

# --- Get extension ID ---

echo ""
echo "To find your extension ID:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode' (top right toggle)"
echo "  3. Click 'Load unpacked' and select: $SCRIPT_DIR"
echo "  4. Copy the ID shown under the extension name"
echo ""
read -rp "Enter your extension ID: " EXT_ID

if [[ -z "$EXT_ID" ]]; then
    echo "Error: Extension ID is required for native messaging to work."
    echo "Load the extension first, then re-run this script."
    exit 1
fi

# --- Write native messaging host manifest ---

cat > "$SCRIPT_DIR/$HOST_NAME.json" << MANIFEST
{
  "name": "$HOST_NAME",
  "description": "yt-dlp download host for Chrome extension",
  "path": "$HOST_WRAPPER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
MANIFEST
echo "[OK] Created host manifest"

# --- Install manifest to Chrome ---

mkdir -p "$CHROME_NMH_DIR"
cp "$SCRIPT_DIR/$HOST_NAME.json" "$CHROME_NMH_DIR/$HOST_NAME.json"
echo "[OK] Installed manifest to Chrome NativeMessagingHosts"

# --- Done ---

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Navigate to any YouTube video"
echo "  2. Click the extension icon in your toolbar"
echo "  3. Pick a quality and click Download"
echo "  4. Videos are saved to ~/Downloads"
echo ""
echo "To change the download directory, edit OUTPUT_DIR in yt_dlp_host.py"
