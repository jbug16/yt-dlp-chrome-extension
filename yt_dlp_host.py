#!/usr/bin/env -S python3 -u
"""
Chrome Native Messaging host for yt-dlp downloads.
Reads JSON messages from Chrome (4-byte length prefix + JSON),
runs yt-dlp, and sends status back via stdout.
"""

import json
import os
import shutil
import struct
import subprocess
import sys
import traceback

LOG_FILE = "/tmp/yt_dlp_host.log"

OUTPUT_DIR = os.path.expanduser("~/Downloads")

YTDLP = shutil.which("yt-dlp") or "/opt/homebrew/bin/yt-dlp"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"


def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("=I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode("utf-8"))


def send_message(msg):
    encoded = json.dumps(msg, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def download_video(url, fmt, audio_only):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    cmd = [
        YTDLP,
        "--no-playlist",
        "--ffmpeg-location", FFMPEG,
        "-f", fmt,
        "--merge-output-format", "mp4",
        "-o", os.path.join(OUTPUT_DIR, "%(title)s.%(ext)s"),
        url,
    ]

    if audio_only:
        cmd = [
            YTDLP,
            "--no-playlist",
            "--ffmpeg-location", FFMPEG,
            "-f", fmt,
            "--extract-audio",
            "--audio-format", "mp3",
            "-o", os.path.join(OUTPUT_DIR, "%(title)s.%(ext)s"),
            url,
        ]

    log(f"Running: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
        )

        log(f"Return code: {result.returncode}")
        log(f"Stdout: {result.stdout[:500]}")
        log(f"Stderr: {result.stderr[:500]}")

        if result.returncode == 0:
            filename = ""
            for line in result.stdout.splitlines():
                if "Destination:" in line:
                    filename = line.split("Destination:")[-1].strip()
                elif "has already been downloaded" in line:
                    filename = line.split("]")[-1].split("has already")[0].strip()
                elif "[Merger]" in line and "Merging formats into" in line:
                    filename = line.split("Merging formats into")[-1].strip().strip('"')

            filepath = filename if filename else ""
            if filepath:
                filename = os.path.basename(filepath)
            else:
                filename = "download complete"
                filepath = ""

            return {"status": "complete", "filename": filename, "filepath": filepath}
        else:
            error_msg = result.stderr.strip() or result.stdout.strip()
            if len(error_msg) > 300:
                error_msg = error_msg[:300] + "..."
            return {"status": "error", "message": error_msg}

    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "Download timed out (10 min limit)"}
    except FileNotFoundError:
        return {"status": "error", "message": "yt-dlp not found. Install with: brew install yt-dlp"}
    except Exception as e:
        log(f"Exception: {traceback.format_exc()}")
        return {"status": "error", "message": str(e)}


def main():
    try:
        log("Host started")
        msg = read_message()
        log(f"Received: {msg}")

        if not msg:
            send_message({"status": "error", "message": "No message received"})
            return

        action = msg.get("action")

        if action == "download":
            url = msg.get("url", "")
            fmt = msg.get("format", "bestvideo+bestaudio/best")
            audio_only = msg.get("audioOnly", False)

            if not url:
                send_message({"status": "error", "message": "No URL provided"})
                return

            result = download_video(url, fmt, audio_only)
            send_message(result)

        elif action == "open_folder":
            filepath = msg.get("filepath", "")
            if filepath and os.path.exists(filepath):
                subprocess.Popen(["open", "-R", filepath])
            else:
                subprocess.Popen(["open", OUTPUT_DIR])
            send_message({"status": "ok"})

        else:
            send_message({"status": "error", "message": f"Unknown action: {action}"})

    except Exception as e:
        log(f"Fatal error: {traceback.format_exc()}")
        try:
            send_message({"status": "error", "message": str(e)})
        except Exception:
            pass


if __name__ == "__main__":
    main()
