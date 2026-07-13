const NATIVE_HOST = "com.ytdlp.downloader";
const DOWNLOAD_STATUS_KEY = "downloadStatus";

let activeDownload = null;
const downloadQueue = [];
const statusByUrl = new Map();

function publicStatus(status) {
  if (!status) {
    return { state: "idle" };
  }

  const { port, ...safeStatus } = status;
  return safeStatus;
}

function saveStatus(status) {
  const safeStatus = publicStatus(status);
  if (safeStatus.url) statusByUrl.set(safeStatus.url, { ...safeStatus });
  chrome.storage.local.set({ [DOWNLOAD_STATUS_KEY]: safeStatus }, () => {
    chrome.runtime.sendMessage(
      { action: "downloadStatusChanged", status: safeStatus },
      () => {
        // It is normal for this to fail when the popup is closed.
        void chrome.runtime.lastError;
      }
    );
  });
}

function setDownloadStatus(status) {
  activeDownload = status.state === "downloading" ? status : null;
  saveStatus(status);
}

function runDownload(request) {
  const status = {
    state: "downloading",
    url: request.url,
    startedAt: Date.now(),
    message: "Downloading in background...",
    queuedCount: downloadQueue.length,
  };

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    status.port = port;
    activeDownload = status;
    saveStatus(status);

    let completed = false;
    const finish = (result) => {
      if (completed) return;
      completed = true;
      setDownloadStatus(result);
      const next = downloadQueue.shift();
      if (next) runDownload(next);
    };

    port.onMessage.addListener((response) => {
      if (response?.status === "progress") {
        status.progress = response.percent || 0;
        status.message = `Downloading… ${Math.round(status.progress)}%`;
        saveStatus(status);
      } else if (response?.status === "complete") {
        finish({ state: "complete", url: request.url, filename: response.filename, filepath: response.filepath, finishedAt: Date.now() });
      } else {
        finish({ state: "error", url: request.url, message: response?.message || "Unexpected response from native host", finishedAt: Date.now() });
      }
    });

    port.onDisconnect.addListener(() => {
      if (!completed) {
        finish({ state: "error", url: request.url, message: chrome.runtime.lastError?.message || "Native host disconnected before the download completed", finishedAt: Date.now() });
      }
    });

    port.postMessage({ action: "download", url: request.url, format: request.format, audioOnly: request.audioOnly });
    return true;
  } catch (error) {
    setDownloadStatus({ state: "error", url: request.url, message: error.message || String(error), finishedAt: Date.now() });
    const next = downloadQueue.shift();
    if (next) runDownload(next);
    return false;
  }
}

function startDownload(request, sendResponse) {
  if (activeDownload) {
    downloadQueue.push({ url: request.url, format: request.format, audioOnly: request.audioOnly });
    statusByUrl.set(request.url, {
      state: "queued",
      url: request.url,
      position: downloadQueue.length,
    });
    activeDownload.queuedCount = downloadQueue.length;
    saveStatus(activeDownload);
    sendResponse({ ok: true, queued: true, position: downloadQueue.length, status: publicStatus(activeDownload) });
    return;
  }
  const started = runDownload(request);
  sendResponse(
    started
      ? { ok: true, queued: false, position: 0, status: publicStatus(activeDownload) }
      : { ok: false, error: "Could not connect to the native download host" }
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startDownload" || request.action === "queueDownload") {
    startDownload(request, sendResponse);
    return false;
  }

  if (request.action === "getDownloadStatus") {
    if (request.url && statusByUrl.has(request.url)) {
      sendResponse(statusByUrl.get(request.url));
      return false;
    }
    chrome.storage.local.get(DOWNLOAD_STATUS_KEY, (items) => {
      sendResponse(items[DOWNLOAD_STATUS_KEY] || { state: "idle" });
    });
    return true;
  }

  return false;
});
