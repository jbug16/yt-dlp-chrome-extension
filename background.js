const NATIVE_HOST = "com.ytdlp.downloader";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "download") {
    const format = getFormat(request.quality);
    const message = {
      action: "download",
      url: request.url,
      format: format,
      audioOnly: request.quality === "audio",
    };

    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          status: "error",
          message: "Connection failed: " + chrome.runtime.lastError.message,
        });
        return;
      }
      sendResponse(response || { status: "error", message: "No response from native host" });
    });

    return true;
  }

  if (request.action === "open_folder") {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { action: "open_folder", filepath: request.filepath || "" },
      () => {}
    );
    return false;
  }
});

function getFormat(quality) {
  switch (quality) {
    case "best":
      return "bestvideo+bestaudio/best";
    case "1080":
      return "bestvideo[height<=1080]+bestaudio/best[height<=1080]";
    case "720":
      return "bestvideo[height<=720]+bestaudio/best[height<=720]";
    case "480":
      return "bestvideo[height<=480]+bestaudio/best[height<=480]";
    case "360":
      return "bestvideo[height<=360]+bestaudio/best[height<=360]";
    case "audio":
      return "bestaudio";
    default:
      return "bestvideo+bestaudio/best";
  }
}
