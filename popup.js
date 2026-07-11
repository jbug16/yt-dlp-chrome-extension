const NATIVE_HOST = "com.ytdlp.downloader";

document.addEventListener("DOMContentLoaded", () => {
  const notYoutube = document.getElementById("not-youtube");
  const videoInfo = document.getElementById("video-info");
  const thumbnail = document.getElementById("thumbnail");
  const videoTitle = document.getElementById("video-title");
  const videoChannel = document.getElementById("video-channel");
  const qualitySelect = document.getElementById("quality");
  const downloadBtn = document.getElementById("download-btn");
  const statusDiv = document.getElementById("status");
  const versionBadge = document.getElementById("version-badge");

  let currentUrl = null;
  let currentStatus = { state: "idle" };

  const manifestVersion = chrome.runtime.getManifest().version;
  const displayVersion = manifestVersion.split(".").slice(0, 2).join(".");
  versionBadge.textContent = `v${displayVersion}`;

  // Query the active tab and ask content script for video info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
      notYoutube.style.display = "block";
      videoInfo.style.display = "none";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "getVideoInfo" }, (response) => {
      if (chrome.runtime.lastError || !response || response.error) {
        // Fallback: extract info from tab URL/title
        const urlMatch = tab.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (urlMatch) {
          showVideo({
            url: tab.url,
            videoId: urlMatch[1],
            title: tab.title.replace(" - YouTube", "").trim(),
            thumbnail: `https://img.youtube.com/vi/${urlMatch[1]}/hqdefault.jpg`,
            channel: "",
          });
        } else {
          notYoutube.style.display = "block";
          videoInfo.style.display = "none";
        }
        return;
      }
      showVideo(response);
    });
  });

  function showVideo(info) {
    notYoutube.style.display = "none";
    videoInfo.style.display = "block";
    thumbnail.src = info.thumbnail;
    videoTitle.textContent = info.title;
    videoChannel.textContent = info.channel;
    currentUrl = info.url;
    renderDownloadStatus(currentStatus);
  }

  function setStatus(type, message) {
    statusDiv.className = "status " + type;
    // Clear previous content
    statusDiv.textContent = "";

    if (type === "downloading") {
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      statusDiv.appendChild(spinner);
      statusDiv.appendChild(document.createTextNode(message));
    } else {
      statusDiv.textContent = message;
    }
    statusDiv.style.display = "block";
  }

  function showFinderButton(filepath) {
    const btn = document.createElement("button");
    btn.className = "finder-btn";
    btn.textContent = "Show in Finder";
    btn.addEventListener("click", () => {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST,
        { action: "open_folder", filepath: filepath || "" },
        () => {}
      );
    });
    statusDiv.appendChild(btn);
  }

  function renderDownloadStatus(status) {
    currentStatus = status || { state: "idle" };

    if (!currentUrl) {
      return;
    }

    if (currentStatus.state === "downloading") {
      downloadBtn.disabled = true;
      const message =
        currentStatus.url === currentUrl
          ? currentStatus.message || "Downloading in background..."
          : "Another download is running in background...";
      setStatus("downloading", message);
      return;
    }

    downloadBtn.disabled = false;

    if (currentStatus.url && currentStatus.url !== currentUrl) {
      statusDiv.style.display = "none";
      return;
    }

    if (currentStatus.state === "complete") {
      setStatus("complete", "Downloaded: " + (currentStatus.filename || "download complete"));
      showFinderButton(currentStatus.filepath);
    } else if (currentStatus.state === "error") {
      setStatus("error", "Error: " + (currentStatus.message || "Download failed"));
    } else {
      statusDiv.style.display = "none";
    }
  }

  function refreshDownloadStatus() {
    chrome.runtime.sendMessage({ action: "getDownloadStatus" }, (status) => {
      if (chrome.runtime.lastError) {
        return;
      }
      renderDownloadStatus(status);
    });
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "downloadStatusChanged") {
      renderDownloadStatus(request.status);
    }
  });

  refreshDownloadStatus();

  downloadBtn.addEventListener("click", () => {
    if (!currentUrl) return;

    const quality = qualitySelect.value;
    downloadBtn.disabled = true;
    setStatus("downloading", "Starting download...");

    // Build yt-dlp format string based on quality selection
    let format;
    switch (quality) {
      case "best":
        format = "bestvideo+bestaudio/best";
        break;
      case "1080":
        format = "bestvideo[height<=1080]+bestaudio/best[height<=1080]";
        break;
      case "720":
        format = "bestvideo[height<=720]+bestaudio/best[height<=720]";
        break;
      case "480":
        format = "bestvideo[height<=480]+bestaudio/best[height<=480]";
        break;
      case "360":
        format = "bestvideo[height<=360]+bestaudio/best[height<=360]";
        break;
      case "audio":
        format = "bestaudio";
        break;
    }

    const downloadRequest = {
      url: currentUrl,
      format: format,
      audioOnly: quality === "audio",
    };

    chrome.runtime.sendMessage({ action: "startDownload", ...downloadRequest }, (response) => {
      if (chrome.runtime.lastError) {
        downloadBtn.disabled = false;
        setStatus(
          "error",
          "Connection failed: " + chrome.runtime.lastError.message
        );
        return;
      }

      if (!response || !response.ok) {
        downloadBtn.disabled = false;
        if (response?.status) {
          renderDownloadStatus(response.status);
        }
        setStatus("error", response?.error || "Could not start download");
        return;
      }

      renderDownloadStatus(response.status);
    });
  });
});
