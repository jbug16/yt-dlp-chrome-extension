// Content script: extracts video metadata from YouTube pages
// Responds to messages from the popup and injects download button

const DOWNLOAD_BTN_ID = "ytdlp-download-btn";
const DOWNLOAD_MENU_ID = "ytdlp-download-menu";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getVideoInfo") {
    const info = extractVideoInfo();
    sendResponse(info);
  }
  return true;
});

function extractVideoInfo() {
  const url = window.location.href;

  const videoIdMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (!videoIdMatch) {
    return { error: "Not a YouTube video page" };
  }

  const videoId = videoIdMatch[1];

  const titleEl =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("h1.title") ||
    document.querySelector("#title h1");
  const title = titleEl
    ? titleEl.textContent.trim()
    : document.title.replace(" - YouTube", "").trim();

  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  const channelEl =
    document.querySelector("#channel-name a") ||
    document.querySelector("ytd-channel-name a");
  const channel = channelEl ? channelEl.textContent.trim() : "";

  return {
    url: url,
    videoId: videoId,
    title: title,
    thumbnail: thumbnail,
    channel: channel,
  };
}

function injectStyles() {
  if (document.getElementById("ytdlp-styles")) return;

  const style = document.createElement("style");
  style.id = "ytdlp-styles";
  style.textContent = `
    #${DOWNLOAD_BTN_ID} {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      height: 36px;
      border-radius: 18px;
      background: #272727;
      color: #fff;
      font-size: 14px;
      font-weight: 500;
      font-family: "Roboto", "Arial", sans-serif;
      border: none;
      cursor: pointer;
      margin-left: 8px;
      transition: background-color 0.2s;
    }
    #${DOWNLOAD_BTN_ID}:hover {
      background: #3f3f3f;
    }
    #${DOWNLOAD_BTN_ID} svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
    #${DOWNLOAD_MENU_ID} {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      background: #212121;
      border-radius: 12px;
      padding: 8px 0;
      min-width: 180px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.4);
      z-index: 9999;
      display: none;
    }
    #${DOWNLOAD_MENU_ID}.show {
      display: block;
    }
    #${DOWNLOAD_MENU_ID} .menu-item {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      color: #fff;
      font-size: 14px;
      font-family: "Roboto", "Arial", sans-serif;
      cursor: pointer;
      transition: background-color 0.15s;
    }
    #${DOWNLOAD_MENU_ID} .menu-item:hover {
      background: #3f3f3f;
    }
    #${DOWNLOAD_MENU_ID} .menu-item.downloading {
      opacity: 0.6;
      pointer-events: none;
    }
    #${DOWNLOAD_MENU_ID} .menu-divider {
      height: 1px;
      background: #3f3f3f;
      margin: 8px 0;
    }
    .ytdlp-btn-wrapper {
      position: relative;
      display: inline-flex;
    }
    .ytdlp-toast {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #212121;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-family: "Roboto", "Arial", sans-serif;
      z-index: 99999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      animation: ytdlp-toast-in 0.3s ease;
    }
    .ytdlp-toast.success {
      background: #1a7f37;
    }
    .ytdlp-toast.error {
      background: #cf222e;
    }
    @keyframes ytdlp-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

function createDownloadButton() {
  const wrapper = document.createElement("div");
  wrapper.className = "ytdlp-btn-wrapper";

  const btn = document.createElement("button");
  btn.id = DOWNLOAD_BTN_ID;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M5 20h14v-2H5v2zm7-18v12.17l3.59-3.58L17 12l-5 5-5-5 1.41-1.41L12 14.17V2z"/>
    </svg>
    Download
  `;

  const menu = document.createElement("div");
  menu.id = DOWNLOAD_MENU_ID;
  menu.innerHTML = `
    <div class="menu-item" data-quality="best">Best Quality</div>
    <div class="menu-item" data-quality="1080">1080p</div>
    <div class="menu-item" data-quality="720">720p</div>
    <div class="menu-item" data-quality="480">480p</div>
    <div class="menu-item" data-quality="360">360p</div>
    <div class="menu-divider"></div>
    <div class="menu-item" data-quality="audio">Audio Only (MP3)</div>
  `;

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("show");
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item || item.classList.contains("downloading")) return;

    const quality = item.dataset.quality;
    startDownload(quality, item);
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      menu.classList.remove("show");
    }
  });

  return wrapper;
}

function startDownload(quality, menuItem) {
  const info = extractVideoInfo();
  if (info.error) {
    showToast("Not on a video page", "error");
    return;
  }

  menuItem.classList.add("downloading");
  const originalText = menuItem.textContent;
  menuItem.textContent = "Downloading...";

  showToast("Starting download...");

  chrome.runtime.sendMessage(
    {
      action: "download",
      url: info.url,
      quality: quality,
    },
    (response) => {
      menuItem.classList.remove("downloading");
      menuItem.textContent = originalText;

      const menu = document.getElementById(DOWNLOAD_MENU_ID);
      if (menu) menu.classList.remove("show");

      if (!response) {
        showToast("Download failed - no response", "error");
        return;
      }

      if (response.status === "complete") {
        showToast(`Downloaded: ${response.filename}`, "success");
      } else if (response.status === "error") {
        showToast(`Error: ${response.message}`, "error");
      } else {
        showToast("Download failed", "error");
      }
    }
  );
}

function showToast(message, type = "") {
  const existing = document.querySelector(".ytdlp-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "ytdlp-toast" + (type ? " " + type : "");
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

function injectDownloadButton() {
  if (document.getElementById(DOWNLOAD_BTN_ID)) return;

  const info = extractVideoInfo();
  if (info.error) return;

  injectStyles();

  const actionsContainer =
    document.querySelector("#actions #top-level-buttons-computed") ||
    document.querySelector("#top-level-buttons-computed") ||
    document.querySelector("ytd-watch-metadata #actions") ||
    document.querySelector("#menu-container");

  if (actionsContainer) {
    const downloadBtn = createDownloadButton();
    actionsContainer.appendChild(downloadBtn);
    return;
  }

  const actionButtons = document.querySelector("#actions ytd-menu-renderer");
  if (actionButtons) {
    const downloadBtn = createDownloadButton();
    actionButtons.parentElement.insertBefore(downloadBtn, actionButtons);
  }
}

function observePageChanges() {
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryInjectButton, 1000);
    }

    if (!document.getElementById(DOWNLOAD_BTN_ID)) {
      tryInjectButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function tryInjectButton() {
  if (window.location.href.includes("youtube.com/watch")) {
    injectDownloadButton();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    tryInjectButton();
    observePageChanges();
  });
} else {
  tryInjectButton();
  observePageChanges();
}
