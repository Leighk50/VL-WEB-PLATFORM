(() => {
  "use strict";

  const $ = (s, root=document) => root.querySelector(s);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let enquiries = [];

  async function request(url, options={}) {
    const response = await fetch(url, {
      ...options,
      credentials:"same-origin",
      headers:{"Content-Type":"application/json", ...(options.headers || {})}
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = "/admin";
      throw new Error("Your session has expired.");
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function formatDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", {dateStyle:"medium", timeStyle:"short"});
  }

  function detailRows(item) {
    const skip = new Set(["name","email","phone"]);
    return Object.entries(item.details || {})
      .filter(([k,v]) => !skip.has(k) && String(v || "").trim())
      .map(([key,value]) => `<div><strong>${esc(key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase()))}:</strong> ${esc(value)}</div>`)
      .join("");
  }

  function render() {
    const box = $("#enquiriesList");
    const openCount = enquiries.filter(x => !x.dealtWith).length;
    const count = $("#enquiryOpenCount");
    if (count) count.textContent = openCount;
    if (!box) return;

    if (!enquiries.length) {
      box.innerHTML = '<div class="admin-card"><p>No website enquiries have been received yet.</p></div>';
      return;
    }

    box.innerHTML = enquiries.map(item => `
      <article class="admin-card" style="border-left:5px solid ${item.dealtWith ? '#7a9b78' : '#bd8b3a'};opacity:${item.dealtWith ? '.72' : '1'}">
        <div class="item-actions" style="align-items:flex-start">
          <div>
            <div class="eyebrow">${esc(item.type)} · ${esc(formatDate(item.receivedAt))}</div>
            <h3 style="margin-bottom:8px">${esc(item.name || "Unnamed enquiry")}</h3>
            <p style="margin:0"><a href="mailto:${esc(item.email)}">${esc(item.email)}</a>${item.phone ? ` · <a href="tel:${esc(item.phone)}">${esc(item.phone)}</a>` : ""}</p>
          </div>
          <label class="switchline" style="white-space:nowrap;margin:0">
            <input type="checkbox" data-enquiry-dealt="${esc(item.id)}" ${item.dealtWith ? "checked" : ""}> Dealt with
          </label>
        </div>
        <div style="margin-top:18px;line-height:1.65">${detailRows(item)}</div>
        ${item.dealtWithAt ? `<p style="margin:16px 0 0;font-size:.85rem"><strong>Completed:</strong> ${esc(formatDate(item.dealtWithAt))}</p>` : ""}
      </article>`).join("");

    box.querySelectorAll("[data-enquiry-dealt]").forEach(input => {
      input.onchange = async () => {
        input.disabled = true;
        const item = enquiries.find(x => x.id === input.dataset.enquiryDealt);
        try {
          const result = await request(`/api/admin/enquiries/${encodeURIComponent(input.dataset.enquiryDealt)}`, {
            method:"PUT",
            body:JSON.stringify({dealtWith:input.checked})
          });
          if (item) Object.assign(item, result.enquiry);
          render();
        } catch (err) {
          input.checked = !input.checked;
          alert(err.message);
        } finally {
          input.disabled = false;
        }
      };
    });
  }

  async function load() {
    const status = $("#enquiriesStatus");
    if (status) status.textContent = "Loading enquiries…";
    try {
      const data = await request("/api/admin/enquiries");
      enquiries = data.enquiries || [];
      render();
      if (status) status.textContent = `${enquiries.filter(x=>!x.dealtWith).length} open · ${enquiries.length} total`;
    } catch (err) {
      if (status) status.textContent = err.message;
    }
  }

  const enquiryNav = document.querySelector('[data-panel="enquiries"]');
  if (enquiryNav) enquiryNav.addEventListener("click", load);
  const refresh = $("#refreshEnquiries");
  if (refresh) refresh.onclick = load;

  load();
})();
