const NATIVE_HOST = "com.ytdlp.downloader";
const DOWNLOAD_STATUS_KEY = "downloadStatus";

let activeDownload = null;

function publicStatus(status) {
  if (!status) {
    return { state: "idle" };
  }

  const { port, ...safeStatus } = status;
  return safeStatus;
}

function saveStatus(status) {
  const safeStatus = publicStatus(status);
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

function startDownload(request, sendResponse) {
  if (activeDownload) {
    sendResponse({ ok: false, status: publicStatus(activeDownload), error: "Download already in progress" });
    return;
  }

  const status = {
    state: "downloading",
    url: request.url,
    startedAt: Date.now(),
    message: "Downloading in background...",
  };

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    status.port = port;
    activeDownload = status;
    saveStatus(status);

    let completed = false;

    port.onMessage.addListener((response) => {
      completed = true;

      if (response && response.status === "complete") {
        setDownloadStatus({
          state: "complete",
          url: request.url,
          filename: response.filename,
          filepath: response.filepath,
          finishedAt: Date.now(),
        });
      } else if (response && response.status === "error") {
        setDownloadStatus({
          state: "error",
          url: request.url,
          message: response.message || "Download failed",
          finishedAt: Date.now(),
        });
      } else {
        setDownloadStatus({
          state: "error",
          url: request.url,
          message: "Unexpected response from native host",
          finishedAt: Date.now(),
        });
      }
    });

    port.onDisconnect.addListener(() => {
      if (completed) {
        return;
      }

      setDownloadStatus({
        state: "error",
        url: request.url,
        message:
          chrome.runtime.lastError?.message ||
          "Native host disconnected before the download completed",
        finishedAt: Date.now(),
      });
    });

    port.postMessage({
      action: "download",
      url: request.url,
      format: request.format,
      audioOnly: request.audioOnly,
    });

    sendResponse({ ok: true, status: publicStatus(status) });
  } catch (error) {
    setDownloadStatus({
      state: "error",
      url: request.url,
      message: error.message || String(error),
      finishedAt: Date.now(),
    });
    sendResponse({ ok: false, error: error.message || String(error) });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startDownload") {
    startDownload(request, sendResponse);
    return false;
  }

  if (request.action === "getDownloadStatus") {
    chrome.storage.local.get(DOWNLOAD_STATUS_KEY, (items) => {
      sendResponse(items[DOWNLOAD_STATUS_KEY] || { state: "idle" });
    });
    return true;
  }

  return false;
});
