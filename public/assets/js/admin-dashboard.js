(() => {
  "use strict";

  let content = null;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const uid = () => (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function request(url, options={}) {
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers: {"Content-Type":"application/json", ...(options.headers || {})}
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = "/admin";
      throw new Error("Your session has expired.");
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function toLocalInput(value){
    if(!value)return "";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }

  function fromLocalInput(value){
    if(!value)return "";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    const pad=n=>String(n).padStart(2,"0");
    const offset=-d.getTimezoneOffset();
    const sign=offset>=0?"+":"-";
    const hh=pad(Math.floor(Math.abs(offset)/60));
    const mm=pad(Math.abs(offset)%60);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${hh}:${mm}`;
  }

  async function uploadEventImage(file,event,card){
    if(!file)return;
    const status=$("[data-upload-status]",card),preview=$("[data-image-preview]",card),pathField=$('[data-event="image"]',card);
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){status.textContent="Please choose a JPG, PNG or WebP image.";return}
    if(file.size>6*1024*1024){status.textContent="Image must be 6 MB or smaller.";return}
    status.textContent="Uploading imageâ€¦";
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||"").split(",")[1]||"");r.onerror=()=>reject(new Error("Could not read image."));r.readAsDataURL(file)});
    try{
      const result=await request("/api/admin/upload-image",{method:"POST",body:JSON.stringify({filename:file.name,mime:file.type,data})});
      event.image=result.url;if(pathField)pathField.value=result.url;if(preview)preview.src=result.url+"?v="+Date.now();
      status.textContent="Image uploaded. Click Save All Changes.";
    }catch(err){status.textContent=err.message}
  }

  function renderStats() {
    $("#menuCount").textContent = content.menus.filter(m => m.visible).length;
    $("#dishCount").textContent = content.menus.reduce(
      (n,m) => n + (m.sections || []).reduce((x,s) => x + (s.items || []).length, 0), 0
    );
    $("#eventCount").textContent = content.events.length;
  }

  function renderSettings() {
    $$("[data-setting]").forEach(el => {
      el.value = content.settings[el.dataset.setting] || "";
      el.oninput = () => { content.settings[el.dataset.setting] = el.value; };
    });
  }

  function dishHtml(d) {
    return `<div class="item-card">
      <div class="item-actions"><h3>Dish</h3><button type="button" data-delete-dish class="danger-btn">Delete</button></div>
      <label>Name<input data-dish="name" value="${esc(d.name)}"></label>
      <div class="row-2">
        <label>Price<input data-dish="price" value="${esc(d.price || "")}"></label>
        <label class="switchline"><input type="checkbox" data-dish="visible" ${d.visible !== false ? "checked" : ""}> Show</label>
      </div>
      <label>Description<textarea data-dish="description">${esc(d.description || "")}</textarea></label>
      <label>Allergens<input data-dish="allergens" value="${esc(d.allergens || "")}"></label>
    </div>`;
  }

  function sectionHtml(s) {
    return `<div class="admin-card section-editor">
      <div class="item-actions"><h3>Section</h3><button type="button" data-delete-section class="danger-btn">Delete</button></div>
      <label>Section Name<input data-section-name value="${esc(s.name)}"></label>
      <button type="button" data-add-dish class="small-btn">Add Dish</button>
      <div class="dish-grid">${(s.items || []).map(dishHtml).join("")}</div>
    </div>`;
  }

  function bindSection(sectionEl, menu, sectionIndex) {
    const section = menu.sections[sectionIndex];
    $("[data-section-name]", sectionEl).oninput = e => { section.name = e.target.value; };

    $("[data-add-dish]", sectionEl).onclick = () => {
      section.items.push({id:uid(), name:"New Dish", description:"", price:"", allergens:"", visible:true});
      renderMenus();
      renderStats();
    };

    $("[data-delete-section]", sectionEl).onclick = () => {
      if (confirm("Delete this section?")) {
        menu.sections.splice(sectionIndex, 1);
        renderMenus();
      }
    };

    $$(".item-card", sectionEl).forEach((card, dishIndex) => {
      const dish = section.items[dishIndex];
      $$("[data-dish]", card).forEach(input => {
        input.oninput = () => {
          dish[input.dataset.dish] = input.type === "checkbox" ? input.checked : input.value;
        };
      });
      $("[data-delete-dish]", card).onclick = () => {
        section.items.splice(dishIndex, 1);
        renderMenus();
        renderStats();
      };
    });
  }

  function renderMenus() {
    const box = $("#menusEditor");
    box.innerHTML = "";

    content.menus.forEach((menu, menuIndex) => {
      const el = document.createElement("div");
      el.className = "menu-editor";
      el.innerHTML = `<div class="menu-head">
          <h2>${esc(menu.name)}</h2>
          <div><button type="button" data-add-section class="small-btn">Add Section</button>
          <button type="button" data-delete-menu class="danger-btn">Delete Menu</button></div>
        </div>
        <div class="row-2">
          <label>Menu Name<input data-menu="name" value="${esc(menu.name)}"></label>
          <label class="switchline"><input type="checkbox" data-menu="visible" ${menu.visible ? "checked" : ""}> Show menu</label>
        </div>
        <label>Description<textarea data-menu="description">${esc(menu.description || "")}</textarea></label>
        <div>${(menu.sections || []).map(sectionHtml).join("")}</div>`;

      box.appendChild(el);

      $$("[data-menu]", el).forEach(input => {
        input.oninput = () => {
          menu[input.dataset.menu] = input.type === "checkbox" ? input.checked : input.value;
        };
      });

      $("[data-add-section]", el).onclick = () => {
        menu.sections = menu.sections || [];
        menu.sections.push({name:"New Section", items:[]});
        renderMenus();
      };

      $("[data-delete-menu]", el).onclick = () => {
        if (confirm("Delete this menu?")) {
          content.menus.splice(menuIndex, 1);
          renderAll();
        }
      };

      $$(".section-editor", el).forEach((sectionEl, sectionIndex) => bindSection(sectionEl, menu, sectionIndex));
    });
  }

  function renderEvents() {
    const box = $("#eventsEditor");
    box.innerHTML = "";

    content.events.forEach((event,index)=>{
      const el=document.createElement("div");
      el.className="item-card";
      el.innerHTML=`<div class="item-actions">
        <h3>${esc(event.title)}</h3>
        <button type="button" data-delete class="danger-btn">Delete</button>
      </div>

      <label>Title
        <input data-event="title" value="${esc(event.title)}">
      </label>

      <label>Display Date
        <input data-event="date" value="${esc(event.date||"")}" placeholder="Friday 4 September Â· 7:00pm">
      </label>

      <div class="row-2">
        <label>Google Start Date & Time
          <input type="datetime-local" data-event="startDateLocal" value="${esc(toLocalInput(event.startDate))}">
        </label>
        <label>Google End Date & Time
          <input type="datetime-local" data-event="endDateLocal" value="${esc(toLocalInput(event.endDate))}">
        </label>
      </div>

      <div class="row-2">
        <label>Price per person (Â£)
          <input type="number" min="0" step="0.01" data-event="price" value="${esc(event.price??"")}">
        </label>
        <label>Performer / Entertainer
          <input data-event="performer" value="${esc(event.performer||"")}">
        </label>
      </div>

      <label>Description
        <textarea data-event="description">${esc(event.description||"")}</textarea>
      </label>

      <label>Ticket Link
        <input data-event="ticketUrl" value="${esc(event.ticketUrl||"")}">
      </label>

      <div class="event-image-editor">
        <label>Event Image</label>
        <img data-image-preview src="${esc(event.image||"/assets/images/event.webp")}" alt="Current event image" style="display:block;width:min(100%,520px);max-height:300px;object-fit:cover;margin:8px 0 12px;border:1px solid #ddd">
        <div class="actions" style="align-items:center">
          <label class="btn" style="cursor:pointer;margin:0">Upload Image<input type="file" data-event-upload accept="image/jpeg,image/png,image/webp" style="display:none"></label>
          <span data-upload-status style="font-size:.9rem"></span>
        </div>
        <label style="margin-top:10px">Image path<input data-event="image" value="${esc(event.image||"/assets/images/event.webp")}" readonly></label>
      </div>

      <label class="switchline">
        <input type="checkbox" data-event="visible" ${event.visible?"checked":""}> Show event
      </label>

      <label class="switchline">
        <input type="checkbox" data-event="featured" ${event.featured?"checked":""}> Feature on homepage
      </label>`;

      box.appendChild(el);

      $$("[data-event]",el).forEach(input=>{
        input.oninput=()=>{
          const key=input.dataset.event;
          if(key==="startDateLocal")event.startDate=fromLocalInput(input.value);
          else if(key==="endDateLocal")event.endDate=fromLocalInput(input.value);
          else event[key]=input.type==="checkbox"?input.checked:input.value;
        };
      });

      const uploader=$("[data-event-upload]",el);
      if(uploader)uploader.onchange=()=>{const file=uploader.files&&uploader.files[0];uploadEventImage(file,event,el);};

      $("[data-delete]",el).onclick=()=>{
        content.events.splice(index,1);
        renderEvents();
        renderStats();
      };
    });
  }

  function renderAll() {
    renderStats();
    renderSettings();
    renderMenus();
    renderEvents();
  }

  $$(".admin-nav button").forEach(button => {
    button.onclick = () => {
      $$(".admin-nav button").forEach(x => x.classList.remove("active"));
      button.classList.add("active");
      $$(".admin-panel").forEach(panel => { panel.hidden = true; });
      $(`#panel-${button.dataset.panel}`).hidden = false;
    };
  });

  $("#addMenu").onclick = () => {
    content.menus.push({id:uid(), name:"New Menu", description:"", visible:false, sections:[]});
    renderMenus();
    renderStats();
  };

  $("#addEvent").onclick = () => {
    content.events.unshift({
      id:uid(), title:"New Event", date:"", startDate:"", endDate:"", price:"", currency:"GBP", performer:"", description:"", image:"/assets/images/event.webp", eventStatus:"EventScheduled",
      ticketUrl:"https://villagelimits.touchtakeaway.net/menu",
      visible:true, featured:true
    });
    renderEvents();
    renderStats();
  };

  $("#saveAll").onclick = async () => {
    const status = $("#saveStatus");
    status.textContent = "Savingâ€¦";
    try {
      await request("/api/admin/content", {method:"PUT", body:JSON.stringify(content)});
      status.textContent = "Saved. Changes are live.";
    } catch (err) {
      status.textContent = err.message;
    }
  };

  const saveEvents = $("#saveEvents");
  if (saveEvents) saveEvents.onclick = () => $("#saveAll").click();
  request("/api/admin/content")
    .then(data => { content = data; renderAll(); })
    .catch(err => {
      $("#saveStatus").textContent = err.message;
    });
})();
