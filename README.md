# yt-dlp Chrome Extension

A Chrome extension that downloads YouTube videos using [yt-dlp](https://github.com/yt-dlp/yt-dlp) via Chrome's [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) API.

Unlike browser-only downloaders that are blocked by YouTube's adaptive streaming, this extension delegates the actual download to yt-dlp running locally on your machine — giving you access to all formats and qualities.

## Features

- Download any YouTube video directly from the browser
- Queue downloads from a video page, homepage, search results, or sidebar recommendations
- Quality picker: Best, 1080p, 720p, 480p, 360p, or audio-only (MP3)
- Shows video title and thumbnail in the popup
- "Show in Finder" button after download completes
- Dark theme matching YouTube's UI

## How It Works

```
Chrome Extension  ──Native Messaging──>  Python Host  ──>  yt-dlp
   (popup.js)         (stdio pipe)      (yt_dlp_host.py)   (subprocess)
```

1. You navigate to a YouTube video and click the extension icon
2. The popup extracts the video URL and shows metadata
3. You pick a quality and click **Download**
4. The extension sends a message to a local Python script via Chrome's native messaging protocol
5. The Python host runs `yt-dlp` with your chosen format
6. The downloaded file is saved to `~/Downloads`

## Requirements

- **macOS** (native messaging host paths are macOS-specific)
- **Python 3.8+**
- **yt-dlp** — `brew install yt-dlp`
- **ffmpeg** — `brew install ffmpeg` (required for merging video+audio streams)
- **Google Chrome**

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/yt-dlp-chrome-extension.git
cd yt-dlp-chrome-extension

# 2. Load the extension in Chrome
#    - Open chrome://extensions
#    - Enable "Developer mode" (top right)
#    - Click "Load unpacked" and select this folder
#    - Copy the extension ID shown on the card

# 3. Run the install script
chmod +x install.sh
./install.sh
#    - It will check for dependencies
#    - Prompt you for the extension ID
#    - Set up the native messaging host
```

## Usage

1. Navigate to any YouTube video
2. Click the extension icon in your toolbar
3. Select a quality from the dropdown
4. Click **Download**
5. When complete, click **Show in Finder** to open the file location

## Configuration

**Download directory:** Edit the `OUTPUT_DIR` variable at the top of `yt_dlp_host.py`:

```python
OUTPUT_DIR = os.path.expanduser("~/Downloads")
```

## Project Structure

```
├── manifest.json              # Chrome MV3 extension manifest
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup logic: video detection, download requests
├── content.js                 # Content script: extracts video metadata from YouTube
├── yt_dlp_host.py             # Native messaging host: runs yt-dlp
├── com.ytdlp.downloader.json  # Native messaging host manifest (template)
├── install.sh                 # One-time setup script
├── icon{16,48,128}.png        # Extension icons
└── README.md
```

## Troubleshooting

**"Connection failed: Native host has exited"**
- Re-run `./install.sh` and make sure you entered the correct extension ID
- Check the log file at `/tmp/yt_dlp_host.log` for errors
- Verify yt-dlp works: `yt-dlp --version`

**Downloads are `.webm` instead of `.mp4`**
- Install ffmpeg: `brew install ffmpeg`
- Re-run `./install.sh` to regenerate the wrapper script

**Extension doesn't appear on YouTube**
- Make sure the extension is enabled in `chrome://extensions`
- Refresh the YouTube page after installing

## License

[MIT](LICENSE)
