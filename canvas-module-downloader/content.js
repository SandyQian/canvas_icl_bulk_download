(() => {
  const match = location.pathname.match(/\/courses\/(\d+)/);
  if (!match) return;
  const courseId = match[1];
  const api = `${location.origin}/api/v1`;
  const BUTTON_ID = "cmd-download-all";

  // ---------- Canvas API helpers ----------

  async function getJSON(url) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = (await res.text()).replace(/^while\(1\);/, "");
    const link = res.headers.get("Link") || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    return { data: JSON.parse(text), next: next ? next[1] : null };
  }

  // Follows Canvas pagination until every page is collected.
  async function getAll(url) {
    const out = [];
    while (url) {
      const { data, next } = await getJSON(url);
      out.push(...data);
      url = next;
    }
    return out;
  }

  // Characters that are not allowed in file or folder names.
  function clean(name) {
    return (
      String(name || "untitled")
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
        .replace(/\s+/g, " ")
        .replace(/^[.\s]+|[.\s]+$/g, "")
        .slice(0, 120) || "untitled"
    );
  }

  // Returns `name`, or "name (2).ext" etc. if it is already in `used`.
  function unique(name, used) {
    let candidate = name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      candidate = `${stem} (${n})${ext}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  // ---------- Main routine ----------

  async function collectFiles(setStatus) {
    let courseName = `course-${courseId}`;
    try {
      const { data } = await getJSON(`${api}/courses/${courseId}`);
      courseName = data.course_code || data.name || courseName;
    } catch (_) {
      /* keep the fallback name */
    }

    setStatus("Reading modules…");
    const modules = await getAll(
      `${api}/courses/${courseId}/modules?include[]=items&per_page=100`
    );

    const files = [];
    const skipped = [];
    const usedFolders = new Set();

    for (const mod of modules) {
      // Canvas leaves `items` out when a module is large, so fetch them then.
      const items =
        mod.items ||
        (await getAll(
          `${api}/courses/${courseId}/modules/${mod.id}/items?per_page=100`
        ));
      const fileItems = items.filter((it) => it.type === "File" && it.url);
      if (!fileItems.length) continue;

      // One folder per module (i.e. per week), named after the module.
      const folder = unique(clean(mod.name), usedFolders);
      const usedNames = new Set();

      for (const item of fileItems) {
        setStatus(`Finding files… (${files.length} so far)`);
        try {
          const { data: file } = await getJSON(item.url);
          if (!file.url) throw new Error("locked or no download link");
          const name = unique(
            clean(file.display_name || file.filename || item.title),
            usedNames
          );
          files.push({ url: file.url, path: `${folder}/${name}` });
        } catch (e) {
          skipped.push(`${item.title} (${e.message})`);
        }
      }
    }
    return { files, skipped, zipName: `${clean(courseName)}.zip` };
  }

  async function run(button) {
    const original = button.textContent;
    const setStatus = (t) => (button.textContent = t);
    const onProgress = (msg) => {
      if (msg?.type === "zip-progress") setStatus(msg.text);
    };
    button.disabled = true;
    chrome.runtime.onMessage.addListener(onProgress);
    try {
      const { files, skipped, zipName } = await collectFiles(setStatus);
      if (!files.length) {
        alert(
          "No downloadable files were found in this course's modules." +
            (skipped.length ? `\n\nSkipped:\n${skipped.join("\n")}` : "")
        );
        return;
      }
      setStatus(`Fetching ${files.length} files…`);
      const result = await chrome.runtime.sendMessage({
        type: "download-zip",
        files,
        zipName,
      });
      const problems = [...skipped, ...(result?.errors || [])];
      const problemText = problems.length
        ? `\n\nNot included:\n${problems.join("\n")}`
        : "";
      if (result?.error) {
        alert(`Nothing was saved: ${result.error}${problemText}`);
      } else {
        alert(
          `Saving ${result?.saved ?? 0} of ${files.length} files as ${zipName}.` +
            problemText
        );
      }
    } catch (e) {
      console.error("[Canvas Module File Downloader]", e);
      alert(`Download failed: ${e.message}`);
    } finally {
      chrome.runtime.onMessage.removeListener(onProgress);
      button.disabled = false;
      button.textContent = original;
    }
  }

  // ---------- Button ----------

  function addButton() {
    if (document.getElementById(BUTTON_ID)) return true;
    if (!document.getElementById("context_modules")) return false;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Download all files (zip)";
    button.className = "btn btn-primary";
    button.addEventListener("click", () => run(button));

    const collapse = document.getElementById("expand_collapse_all");
    if (collapse && collapse.parentElement) {
      button.style.marginRight = "8px";
      collapse.parentElement.insertBefore(button, collapse);
    } else {
      // Fallback: float it in the corner if the page layout is different.
      Object.assign(button.style, {
        position: "fixed",
        right: "24px",
        bottom: "24px",
        zIndex: "9999",
        padding: "10px 16px",
        background: "#0374b5",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "14px",
      });
      document.body.appendChild(button);
    }
    return true;
  }

  // The modules list can render a moment after the page loads, so retry briefly.
  let tries = 0;
  const timer = setInterval(() => {
    if (addButton() || ++tries > 20) clearInterval(timer);
  }, 500);
})();
