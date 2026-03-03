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

  let currentUrl = null;

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

    const message = {
      action: "download",
      url: currentUrl,
      format: format,
      audioOnly: quality === "audio",
    };

    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      downloadBtn.disabled = false;

      if (chrome.runtime.lastError) {
        setStatus(
          "error",
          "Connection failed: " + chrome.runtime.lastError.message
        );
        return;
      }

      if (!response) {
        setStatus("error", "No response from native host");
        return;
      }

      if (response.status === "complete") {
        setStatus("complete", "Downloaded: " + response.filename);
        showFinderButton(response.filepath);
      } else if (response.status === "error") {
        setStatus("error", "Error: " + response.message);
      } else {
        setStatus("error", "Unexpected response");
      }
    });
  });
});
