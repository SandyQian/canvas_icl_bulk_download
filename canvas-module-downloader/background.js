// Coordinates the zip build (done in an offscreen page, which can create blob
// URLs) and then starts a single download with a "Save as" dialog.
let zipDownloadId = null;

async function closeOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }
  } catch (_) {
    /* nothing to close */
  }
}

async function buildAndSave(msg, tabId) {
  await closeOffscreen();
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Build the zip of course files and create its download URL.",
  });

  const built = await chrome.runtime.sendMessage({
    type: "build-zip",
    files: msg.files,
    tabId,
  });
  if (!built?.url) {
    await closeOffscreen();
    return {
      saved: 0,
      errors: built?.errors || [],
      error: built?.error || "None of the files could be fetched.",
    };
  }

  try {
    zipDownloadId = await chrome.downloads.download({
      url: built.url,
      filename: msg.zipName,
      saveAs: true, // always ask where to save
    });
  } catch (e) {
    await closeOffscreen();
    return { saved: 0, errors: built.errors, error: e.message };
  }
  return { saved: built.count, errors: built.errors };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "zip-progress") {
    chrome.tabs.sendMessage(msg.tabId, msg).catch(() => {});
    return;
  }
  if (msg?.type !== "download-zip") return;

  buildAndSave(msg, sender.tab.id)
    .then(sendResponse)
    .catch((e) => sendResponse({ saved: 0, errors: [], error: e.message }));
  return true; // keep the message channel open for the async response
});

// The offscreen page owns the zip's blob URL, so keep it until the save ends.
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.id !== zipDownloadId || !delta.state) return;
  if (delta.state.current !== "in_progress") {
    zipDownloadId = null;
    closeOffscreen();
  }
});
