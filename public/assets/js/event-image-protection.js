(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const uploadedThisSession = new Set();

  function eventKey(event) {
    return String(event?.id || event?.title || "");
  }

  async function mergeLatestEventImages(outgoing) {
    try {
      const response = await nativeFetch("/api/admin/content", {
        credentials: "same-origin",
        cache: "no-store",
        headers: {"Accept":"application/json"}
      });
      if (!response.ok) return outgoing;
      const latest = await response.json();
      const latestByKey = new Map((latest.events || []).map(event => [eventKey(event), event]));

      for (const event of outgoing.events || []) {
        const current = latestByKey.get(eventKey(event));
        if (!current) continue;
        const outgoingImage = String(event.image || "");
        const latestImage = String(current.image || "");
        if (!latestImage || outgoingImage === latestImage) continue;

        // Only an image uploaded during this admin session is allowed to replace
        // a newer image already stored on the server. This prevents stale admin
        // tabs from restoring an older or generic event image during Save All.
        if (!uploadedThisSession.has(outgoingImage)) event.image = latestImage;
      }
    } catch (err) {
      console.warn("Event image conflict check skipped", err);
    }
    return outgoing;
  }

  window.fetch = async function protectedFetch(input, init={}) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const method = String(init.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();

    if (url === "/api/admin/upload-image" && method === "POST") {
      const response = await nativeFetch(input, init);
      try {
        const data = await response.clone().json();
        if (response.ok && data?.url) uploadedThisSession.add(String(data.url));
      } catch {}
      return response;
    }

    if (url === "/api/admin/content" && method === "PUT" && typeof init.body === "string") {
      try {
        const outgoing = JSON.parse(init.body);
        await mergeLatestEventImages(outgoing);
        init = {...init, body:JSON.stringify(outgoing)};
      } catch (err) {
        console.warn("Event image save protection could not inspect content", err);
      }
    }

    const response = await nativeFetch(input, init);
    if (url === "/api/admin/content" && method === "PUT" && response.ok) uploadedThisSession.clear();
    return response;
  };
})();
