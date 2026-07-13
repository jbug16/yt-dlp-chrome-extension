// Adds yt-dlp queue controls to YouTube's SPA and supplies metadata to the popup.

const BUTTON_CLASS = "ytdlp-queue-button";
const CARD_MARKER = "data-ytdlp-queue-ready";
const DEFAULT_FORMAT = "bestvideo+bestaudio/best";
const UI_VERSION = "1.3.9";
let pendingMenuUrl = null;

const CARD_SELECTOR = [
  "yt-lockup-view-model",
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-grid-video-renderer",
].join(",");

const VIDEO_LINK_SELECTOR = [
  'a#thumbnail[href*="/watch"]',
  'a#thumbnail[href*="/shorts/"]',
  'a[href*="/watch?v="]',
  'a[href*="/shorts/"]',
].join(",");

const DOWNLOAD_ICON = `
  <svg class="ytdlp-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3Zm-6 16h14v2H5v-2Z"/>
  </svg>`;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getVideoInfo") {
    sendResponse(extractVideoInfo());
  }
  return true;
});

function videoIdFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, location.origin);
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(?:shorts|live)\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  } catch (_) {
    return null;
  }
}

function canonicalVideoUrl(rawUrl) {
  const videoId = videoIdFromUrl(rawUrl);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

function extractVideoInfo() {
  const videoId = videoIdFromUrl(location.href);
  if (!videoId) return { error: "Not a YouTube video page" };

  const titleEl =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("h1.title") ||
    document.querySelector("#title h1");
  const channelEl =
    document.querySelector("#channel-name a") ||
    document.querySelector("ytd-channel-name a");

  return {
    url: canonicalVideoUrl(location.href),
    videoId,
    title: titleEl
      ? titleEl.textContent.trim()
      : document.title.replace(" - YouTube", "").trim(),
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    channel: channelEl ? channelEl.textContent.trim() : "",
  };
}

function queueVideo(button, url) {
  if (!url || button.disabled) return;

  button.dataset.url = url;
  button.disabled = true;
  setButtonState(button, "loading", 3);
  requestAnimationFrame(() => {
    if (button.disabled) setButtonState(button, "loading", 8);
  });

  chrome.runtime.sendMessage(
    {
      action: "queueDownload",
      url,
      format: DEFAULT_FORMAT,
      audioOnly: false,
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setButtonState(button, "error");
        button.title = response?.error || chrome.runtime.lastError?.message || "Could not queue download";
      } else {
        setButtonState(button, response.queued ? "queued" : "loading", response.queued ? 0 : 10);
        button.title = response.queued
          ? `Download is number ${response.position} in the queue`
          : "Download started";
        watchDownloadStatus(button, url);
      }

      if (!response?.ok || response.queued) window.setTimeout(() => resetButton(button), 2200);
    }
  );
}

function setButtonState(button, state = "idle", progress = 0) {
  button.classList.toggle("is-loading", state === "loading");
  button.classList.toggle("is-error", state === "error");
  const boundedProgress = Math.max(0, Math.min(100, progress));
  button.dataset.visualProgress = String(boundedProgress);
  button.style.setProperty("--ytdlp-progress", `${boundedProgress}%`);
  const labelEl = button.querySelector(".ytdlp-label");
  if (labelEl) labelEl.textContent = button.dataset.label || "";
}

function resetButton(button) {
  button.disabled = false;
  button.title = "Queue download with yt-dlp";
  setButtonState(button);
}

function watchDownloadStatus(button, url) {
  if (button.dataset.statusPolling === "true") return;
  button.dataset.statusPolling = "true";

  const startedAt = Date.now();
  const poll = () => {
    if (!button.isConnected || Date.now() - startedAt > 12 * 60 * 1000) {
      delete button.dataset.statusPolling;
      return;
    }

    chrome.runtime.sendMessage({ action: "getDownloadStatus", url }, (status) => {
      if (chrome.runtime.lastError) {
        window.setTimeout(poll, 500);
        return;
      }

      if (status?.url === url && status.state === "downloading") {
        button.disabled = true;
        const reportedProgress = Number(status.progress);
        const hasReportedProgress = Number.isFinite(reportedProgress) && reportedProgress > 0;
        const preparationProgress = Math.min(
          15,
          Math.max(8, Number(button.dataset.visualProgress) || 0) + 1.5
        );
        const visibleProgress = hasReportedProgress ? reportedProgress : preparationProgress;
        button.title = hasReportedProgress
          ? `Downloading with yt-dlp — ${Math.round(reportedProgress)}%`
          : "Preparing download with yt-dlp";
        setButtonState(button, "loading", visibleProgress);
      } else if (status?.url === url && status.state === "complete") {
        setButtonState(button, "idle", 100);
        window.setTimeout(() => resetButton(button), 1000);
        delete button.dataset.statusPolling;
        return;
      } else if (status?.url === url && status.state === "error") {
        button.title = status.message || "Download failed";
        setButtonState(button, "error");
        window.setTimeout(() => resetButton(button), 2200);
        delete button.dataset.statusPolling;
        return;
      }

      window.setTimeout(poll, 500);
    });
  };

  poll();
}

function makeButton(kind, url) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${BUTTON_CLASS} ${BUTTON_CLASS}--${kind}`;
  button.dataset.ytdlpVersion = UI_VERSION;
  button.dataset.label = kind === "card" ? "" : "yt-dlp";
  button.innerHTML = `${DOWNLOAD_ICON}<span class="ytdlp-label">${button.dataset.label}</span>`;
  button.title = "Queue download with yt-dlp";
  button.setAttribute("aria-label", "Queue download with yt-dlp");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    queueVideo(button, url());
  });
  return button;
}

function convertNativeDownloadButton(button) {
  button.classList.add(BUTTON_CLASS, `${BUTTON_CLASS}--native-control`);
  button.dataset.ytdlpVersion = UI_VERSION;
  button.dataset.label = "yt-dlp";
  button.title = "Queue download with yt-dlp";
  button.setAttribute("aria-label", "Queue download with yt-dlp");

  let content = button.querySelector(":scope > .ytdlp-native-content");
  if (!content) {
    content = document.createElement("span");
    content.className = "ytdlp-native-content";
    content.innerHTML = `${DOWNLOAD_ICON}<span class="ytdlp-label">yt-dlp</span>`;
    button.appendChild(content);
  }

  if (button.dataset.ytdlpClickReady !== "true") {
    button.dataset.ytdlpClickReady = "true";
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        queueVideo(button, canonicalVideoUrl(location.href));
      },
      true
    );
  }
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action !== "downloadStatusChanged" || !request.status?.url) return;
  document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
    if (button.dataset.url !== request.status.url) return;
    if (request.status.state === "downloading") {
      button.disabled = true;
      const reportedProgress = Number(request.status.progress);
      const visibleProgress =
        Number.isFinite(reportedProgress) && reportedProgress > 0
          ? reportedProgress
          : Math.max(8, Number(button.dataset.visualProgress) || 0);
      setButtonState(button, "loading", visibleProgress);
    } else if (request.status.state === "complete") {
      setButtonState(button, "idle", 100);
      window.setTimeout(() => resetButton(button), 1400);
    } else if (request.status.state === "error") {
      setButtonState(button, "error");
      window.setTimeout(() => resetButton(button), 2200);
    }
  });
});

function addWatchButton() {
  const url = canonicalVideoUrl(location.href);
  if (!url) return;

  const converted = document.querySelector(`.${BUTTON_CLASS}--native-control`);
  if (converted?.dataset.ytdlpVersion === UI_VERSION) return;

  const nativeDownload = document.querySelector(
    'ytd-watch-metadata button[aria-label="Download"], ytd-watch-metadata button[aria-label^="Download "]'
  );
  if (nativeDownload) {
    document.querySelector(`.${BUTTON_CLASS}--watch`)?.remove();
    convertNativeDownloadButton(nativeDownload);
    return;
  }

  const existing = document.querySelector(`.${BUTTON_CLASS}--watch`);
  if (existing?.dataset.ytdlpVersion === UI_VERSION) return;
  existing?.remove();

  const button = makeButton("watch", () => canonicalVideoUrl(location.href));

  const actions =
    document.querySelector("ytd-watch-metadata #top-level-buttons-computed") ||
    document.querySelector("#menu-container #top-level-buttons-computed");
  if (!actions) return;

  actions.prepend(button);
}

function addCardButtons() {
  document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
    if (card.getAttribute(CARD_MARKER) === UI_VERSION) return;
    card.querySelectorAll(`.${BUTTON_CLASS}--card`).forEach((button) => button.remove());
    const link = card.querySelector(VIDEO_LINK_SELECTOR);
    const url = link && canonicalVideoUrl(link.href);
    if (!url) return;

    const thumbnail =
      link.closest("ytd-thumbnail, yt-thumbnail-view-model") ||
      card.querySelector("ytd-thumbnail, yt-thumbnail-view-model") ||
      link.parentElement;
    if (!thumbnail) return;
    card.setAttribute(CARD_MARKER, UI_VERSION);
    thumbnail.classList.add("ytdlp-thumbnail-host");
    thumbnail.appendChild(makeButton("card", () => canonicalVideoUrl(link.href)));
  });
}

function rememberMenuVideo(event) {
  const menuButton = event.target.closest(
    [
      "ytd-menu-renderer button",
      "ytd-menu-renderer yt-icon-button",
      "#menu button",
      "#menu yt-icon-button",
      ".yt-lockup-metadata-view-model__menu-button button",
      'button[aria-label*="More"]',
      'button[aria-label*="Action menu"]',
    ].join(",")
  );
  if (!menuButton) return;
  const card = menuButton.closest(CARD_SELECTOR);
  const link = card?.querySelector(VIDEO_LINK_SELECTOR);
  pendingMenuUrl = link ? canonicalVideoUrl(link.href) : null;
  if (pendingMenuUrl) window.setTimeout(enhancePage, 0);
}

function addMenuButton() {
  if (!pendingMenuUrl) return;
  const popupSelectors = [
    "ytd-menu-popup-renderer",
    "tp-yt-iron-dropdown",
    '[role="menu"]',
  ];
  const popups = Array.from(document.querySelectorAll(popupSelectors.join(",")));
  const popup = popups.reverse().find((candidate) => candidate.getClientRects().length > 0);
  if (!popup) return;

  const menu =
    popup.querySelector("tp-yt-paper-listbox, #items, yt-list-view-model, [role='menu']") ||
    popup;
  if (!menu) return;
  const oldItem = menu.querySelector(".ytdlp-menu-item");
  if (oldItem?.dataset.ytdlpVersion === UI_VERSION) return;
  oldItem?.remove();

  const menuUrl = pendingMenuUrl;
  const item = makeButton("menu", () => menuUrl);
  item.dataset.url = menuUrl;
  item.classList.add("ytdlp-menu-item");
  item.setAttribute("role", "menuitem");
  item.addEventListener("click", () => {
    document.body.click();
  });
  menu.appendChild(item);
}

function installStyles() {
  if (document.getElementById("ytdlp-queue-styles")) return;
  const style = document.createElement("style");
  style.id = "ytdlp-queue-styles";
  style.textContent = `
    .${BUTTON_CLASS} {
      --ytdlp-progress: 0%;
      position: relative;
      overflow: hidden;
      border: 0;
      cursor: pointer;
      font-family: Roboto, Arial, sans-serif;
      font-weight: 500;
      white-space: nowrap;
    }
    .${BUTTON_CLASS}::before {
      content: "";
      position: absolute;
      inset: 0;
      width: var(--ytdlp-progress);
      background: rgba(255, 0, 0, .3);
      transition: width .35s ease;
      pointer-events: none;
    }
    .${BUTTON_CLASS}.is-loading::after {
      content: "";
      position: absolute;
      inset: 0;
      width: 42%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
      animation: ytdlp-sweep 1.25s ease-in-out infinite;
      pointer-events: none;
    }
    .${BUTTON_CLASS} > * { position: relative; z-index: 1; }
    .${BUTTON_CLASS}:disabled { cursor: default; }
    .ytdlp-icon { width: 22px; height: 22px; flex: 0 0 auto; fill: currentColor; }
    .ytdlp-label:empty { display: none; }
    .${BUTTON_CLASS}--watch {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 36px;
      margin: 0;
      padding: 0 15px 0 13px;
      border-radius: 18px;
      background: var(--yt-spec-badge-chip-background, #f2f2f2);
      color: var(--yt-spec-text-primary, #0f0f0f);
      font-size: 14px;
      line-height: 36px;
      box-sizing: border-box;
    }
    .${BUTTON_CLASS}--watch:hover { background: var(--yt-spec-mono-tonal-hover, rgba(255,255,255,.2)); }
    .${BUTTON_CLASS}--native-control {
      position: relative;
    }
    .${BUTTON_CLASS}--native-control > :not(.ytdlp-native-content) {
      visibility: hidden;
    }
    .ytdlp-native-content {
      position: absolute !important;
      z-index: 2;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 15px 0 13px;
      box-sizing: border-box;
      color: inherit;
      pointer-events: none;
    }
    .ytdlp-thumbnail-host { position: relative !important; }
    .${BUTTON_CLASS}--card {
      position: absolute;
      z-index: 30;
      right: 6px;
      bottom: 6px;
      min-width: 32px;
      height: 32px;
      padding: 0 9px;
      border-radius: 16px;
      background: rgba(15,15,15,.9);
      color: #fff;
      font-size: 16px;
      opacity: 0;
      transition: opacity .12s, background .12s;
      box-shadow: 0 1px 4px rgba(0,0,0,.45);
    }
    .${BUTTON_CLASS}--card .ytdlp-icon { width: 20px; height: 20px; }
    .ytdlp-thumbnail-host:hover .${BUTTON_CLASS}--card,
    .${BUTTON_CLASS}--card:focus,
    .${BUTTON_CLASS}--card:disabled { opacity: 1; }
    .${BUTTON_CLASS}--card:hover { background: #f00; }
    .${BUTTON_CLASS}--menu {
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      min-height: 48px;
      padding: 0 16px;
      background: transparent;
      color: var(--yt-spec-text-primary, #0f0f0f);
      font-size: 14px;
      text-align: left;
    }
    .${BUTTON_CLASS}--menu:hover { background: var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
    @keyframes ytdlp-sweep { from { transform: translateX(-110%); } to { transform: translateX(350%); } }
  `;
  document.documentElement.appendChild(style);
}

let scheduled = false;
function enhancePage() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    installStyles();
    addWatchButton();
    addCardButtons();
    addMenuButton();
  });
}

new MutationObserver(enhancePage).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
document.addEventListener("yt-navigate-finish", enhancePage);
document.addEventListener("pointerdown", rememberMenuVideo, true);
enhancePage();
