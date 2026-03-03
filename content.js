// Content script: extracts video metadata from YouTube pages
// Responds to messages from the popup

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getVideoInfo") {
    const info = extractVideoInfo();
    sendResponse(info);
  }
  return true; // keep channel open for async response
});

function extractVideoInfo() {
  const url = window.location.href;

  // Check if we're on a video page
  const videoIdMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (!videoIdMatch) {
    return { error: "Not a YouTube video page" };
  }

  const videoId = videoIdMatch[1];

  // Extract title from page
  const titleEl =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("h1.title") ||
    document.querySelector("#title h1");
  const title = titleEl
    ? titleEl.textContent.trim()
    : document.title.replace(" - YouTube", "").trim();

  // Thumbnail URL
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // Channel name
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
