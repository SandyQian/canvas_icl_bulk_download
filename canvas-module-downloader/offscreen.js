// Hidden extension page: fetches every file, packs them into one zip and hands
// a blob: URL back to the background worker, which starts the download.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "build-zip") return;

  (async () => {
    const zip = new ZipWriter();
    const errors = [];
    const total = msg.files.length;

    for (let i = 0; i < total; i++) {
      const file = msg.files[i];
      chrome.runtime
        .sendMessage({
          type: "zip-progress",
          tabId: msg.tabId,
          text: `Fetching ${i + 1} of ${total}…`,
        })
        .catch(() => {});
      try {
        const res = await fetch(file.url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await zip.add(file.path, new Uint8Array(await res.arrayBuffer()));
      } catch (e) {
        errors.push(`${file.path} (${e.message})`);
      }
    }

    if (!zip.count) {
      sendResponse({ count: 0, errors });
      return;
    }
    const url = URL.createObjectURL(zip.finish());
    sendResponse({ url, count: zip.count, errors });
  })().catch((e) => sendResponse({ count: 0, errors: [], error: e.message }));

  return true;
});
