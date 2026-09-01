(() => {
  "use strict";
  const $=(s,r=document)=>r.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let rows=[],reportInfo=null;

  async function api(url,options={}){
    const r=await fetch(url,{...options,credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){location.href="/admin";throw new Error("Your admin session has expired.")}
    if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);
    return d;
  }

  function parseCsv(text){
    const out=[];let row=[],field="",quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(c==='"'){if(quoted&&n==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(field);field="";}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(x=>x!==""))out.push(row);row=[];field="";}
      else field+=c;
    }
    row.push(field);if(row.some(x=>x!==""))out.push(row);if(out.length<2)return[];
    const h=out.shift().map(x=>x.trim());
    return out.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]||""])));
  }

  const canon=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  function pick(o,names){
    const keys=Object.keys(o),wanted=names.map(canon);
    for(const n of wanted){const k=keys.find(x=>canon(x)===n);if(k&&String(o[k]||"").trim())return o[k];}
    return"";
  }
  function pickContaining(o,needles){
    const keys=Object.keys(o),wanted=needles.map(canon);
    for(const n of wanted){const k=keys.find(x=>canon(x).includes(n)&&String(o[x]||"").trim());if(k)return o[k];}
    return"";
  }
  function normalizePhone(v){
    let s=String(v||"").trim().replace(/[^\d+]/g,"");
    if(s.startsWith("0044"))s="+44"+s.slice(4);
    else if(s.startsWith("0"))s="+44"+s.slice(1);
    else if(/^44/.test(s))s="+"+s;
    return s;
  }
  function mapped(o){
    const full=pick(o,["guestname","guestfullname","name","customername","customerfullname"])
      ||pickContaining(o,["guestname","customername"]);
    const first=pick(o,["firstname","guestfirstname","customerfirstname"])
      ||pickContaining(o,["firstname"])
      ||full.trim().split(/\s+/)[0];
    const room=pick(o,["roomnumber","allocatedroom","assignedroom","roomname","unitnumber","unitname","room"])
      ||pickContaining(o,["roomnumber","allocatedroom","assignedroom","roomname","unitnumber"])
      ||pickContaining(o,["room"]);
    const phoneRaw=pick(o,["guestmobilenumber","guestmobile","guestphone","guestphonenumber","mobilenumber","mobilephone","mobile","phonenumber","phone","contactnumber","telephone","tel"])
      ||pickContaining(o,["guestmobile","guestphone","mobilenumber","mobilephone","contactnumber","phonenumber","telephone","phone","mobile"]);
    const checkin=pick(o,["checkin","checkindate","arrival","arrivaldate","arrivalday"])
      ||pickContaining(o,["checkindate","arrivaldate","checkin","arrival"]);
    const ref=pick(o,["bookingreference","reservationreference","reservationid","reference","bookingid"])
      ||pickContaining(o,["bookingreference","reservationreference","reservationid","bookingid"]);
    return{first,room,phone:normalizePhone(phoneRaw),phoneRaw,checkin,ref};
  }

  function roomNumber(room){
    const s=String(room||"").trim().toLowerCase();if(!s)return"";
    const explicit=s.match(/(?:room|unit|rm)\s*[-:#]?\s*([1-6])\b/i);if(explicit)return explicit[1];
    const lone=s.match(/\b([1-6])\b/);if(lone)return lone[1];
    const words={one:"1",two:"2",three:"3",four:"4",five:"5",six:"6"};
    for(const [word,n] of Object.entries(words)){if(new RegExp(`\\b(?:room|unit|rm)?\\s*${word}\\b`,`i`).test(s))return n;}
    return"";
  }
  function storedCode(room){const n=roomNumber(room),el=n?$(`[data-keysafe-room="${n}"]`):null;return el?el.value.trim():""}
  function message(g,code){const rn=roomNumber(g.room)||g.room;return `Village Limits Self Check-in\nDear ${g.first}\nYou are booked in to Room ${rn} and the keys are in the key safe next to the room door and the code is ${code}. Breakfast is served from 8am to 10am in the breakfast room next to the accommodation. Should you have any problems checking in or during your stay please call 01526 353312 option 0.`}

  function ymd(y,m,d){return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
  function localYmd(date){return ymd(date.getFullYear(),date.getMonth()+1,date.getDate())}
  function tomorrow(){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+1);return d}
  function parseCheckinDate(value){
    const v=String(value||"").trim();if(!v)return"";
    let m=v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);if(m)return ymd(Number(m[1]),Number(m[2]),Number(m[3]));
    m=v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);if(m)return ymd(Number(m[3]),Number(m[2]),Number(m[1]));
    const d=new Date(v);return Number.isNaN(d.getTime())?"":localYmd(d);
  }
  function tomorrowLabel(date){return new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(date)}

  function render(){
    const box=$("#smsGuests");if(!box)return;
    box.innerHTML=rows.map((g,i)=>{
      const rn=roomNumber(g.room),code=storedCode(g.room),roomLabel=rn?`Room ${rn}`:(g.room||"Room not found");
      const warnings=[];if(!g.phone)warnings.push("Mobile number not detected");if(!rn)warnings.push("Room number not recognised");else if(!code)warnings.push(`No saved key-safe code for Room ${rn}`);
      return `<div class="admin-card" style="margin-bottom:14px"><div class="item-actions"><h3>${esc(g.first||"Guest")} · ${esc(roomLabel)}</h3><label class="switchline"><input type="checkbox" data-send="${i}" ${g.phone&&code?"checked":""}> Send</label></div>${warnings.length?`<p class="form-error" style="margin-top:0">${esc(warnings.join(" · "))}</p>`:""}<div class="row-2"><label>Mobile<input data-phone="${i}" value="${esc(g.phone)}" placeholder="Mobile number"></label><label>Key-safe code<input data-code="${i}" autocomplete="off" value="${esc(code)}" placeholder="${rn?`No saved code for Room ${rn}`:"Room not recognised"}"></label></div><label>Message<textarea data-msg="${i}" rows="7">${esc(message(g,code||"[CODE]"))}</textarea></label><small>${esc(g.checkin?`Check-in: ${g.checkin}`:"")} ${esc(g.ref?` · Ref: ${g.ref}`:"")}</small></div>`;
    }).join("");
    if(reportInfo){
      const ignored=reportInfo.total-rows.length,missingPhones=rows.filter(g=>!g.phone).length,missingRooms=rows.filter(g=>!roomNumber(g.room)).length,missingCodes=rows.filter(g=>roomNumber(g.room)&&!storedCode(g.room)).length;
      let summary=rows.length?`${reportInfo.label}: ${rows.length} arrival${rows.length===1?"":"s"} found. ${ignored} other reservation${ignored===1?"":"s"} ignored.`:`No arrivals found for ${reportInfo.label}.`;
      const issues=[];if(missingPhones)issues.push(`${missingPhones} missing mobile`);if(missingRooms)issues.push(`${missingRooms} room not recognised`);if(missingCodes)issues.push(`${missingCodes} missing key-safe code`);if(reportInfo.unreadable)issues.push(`${reportInfo.unreadable} unreadable check-in date${reportInfo.unreadable===1?"":"s"}`);
      if(issues.length)summary+=` Attention: ${issues.join(", ")}.`;
      if(reportInfo.headers&&reportInfo.headers.length)summary+=` CSV columns detected: ${reportInfo.headers.join(" | ")}.`;
      $("#smsCount").textContent=summary;
    }else $("#smsCount").textContent=`${rows.length} reservation${rows.length===1?"":"s"} loaded`;
  }

  async function loadKeySafeCodes(){
    const status=$("#keySafeStatus");
    try{
      const data=await api("/api/admin/key-safe-codes");
      for(let n=1;n<=6;n++){const el=$(`[data-keysafe-room="${n}"]`);if(el)el.value=String((data.codes||{})[String(n)]||"");}
      if(status)status.textContent="Current room codes loaded securely.";
      if(rows.length)render();
    }catch(e){if(status)status.textContent=e.message;}
  }

  async function saveKeySafeCodes(){
    const btn=$("#saveKeySafeCodes"),status=$("#keySafeStatus");if(!btn||!status)return;
    btn.disabled=true;status.textContent="Saving key safe codes…";
    try{
      const codes={};for(let n=1;n<=6;n++){const el=$(`[data-keysafe-room="${n}"]`);codes[String(n)]=el?el.value.trim():"";}
      await api("/api/admin/key-safe-codes",{method:"PUT",body:JSON.stringify({codes})});
      status.textContent="Key safe codes saved securely.";if(rows.length)render();
    }catch(e){status.textContent=e.message}finally{btn.disabled=false}
  }

  function toggleKeySafeCodes(){const btn=$("#showKeySafeCodes"),show=btn&&btn.dataset.show!=="true";document.querySelectorAll("[data-keysafe-room]").forEach(el=>el.type=show?"text":"password");if(btn){btn.dataset.show=show?"true":"false";btn.textContent=show?"Hide codes":"Show codes";}}

  async function checkSmsStatus(){const status=$("#smsStatus");try{const data=await api("/api/admin/guest-sms/status");if(status)status.textContent=data.configured?"Webex SMS is connected and ready.":"Webex SMS token is not configured in Azure.";}catch(e){if(status)status.textContent=e.message;}}

  async function send(){
    const btn=$("#sendSmsBatch"),status=$("#smsStatus"),from=$("#smsSender").value,items=[];
    rows.forEach((g,i)=>{const selected=$(`[data-send="${i}"]`);if(!selected||!selected.checked)return;const phone=$(`[data-phone="${i}"]`).value.trim(),code=$(`[data-code="${i}"]`).value.trim(),edited=$(`[data-msg="${i}"]`).value;if(!phone||!code)return;items.push({phone,message:edited.replace("[CODE]",code),reference:g.ref||`${g.room}-${g.checkin}`})});
    if(!items.length){status.textContent="Nothing ready to send. Check mobile numbers and key-safe codes.";return}
    if(!confirm(`Send ${items.length} SMS message${items.length===1?"":"s"}?`))return;
    btn.disabled=true;status.textContent="Sending…";
    try{const d=await api("/api/admin/guest-sms/send",{method:"POST",body:JSON.stringify({from,items})});status.textContent=d.failed?`${d.queued} message${d.queued===1?"":"s"} queued; ${d.failed} failed. Review before retrying.`:`${d.queued} message${d.queued===1?"":"s"} queued successfully.`;}catch(e){status.textContent=e.message}finally{btn.disabled=false}
  }

  const input=$("#hotelCsv");
  if(input)input.onchange=async()=>{
    const f=input.files&&input.files[0];if(!f)return;
    const parsed=parseCsv(await f.text()),headers=parsed[0]?Object.keys(parsed[0]):[];
    const all=parsed.map(mapped).filter(g=>g.first||g.room||g.phone||g.checkin);
    const target=tomorrow(),targetYmd=localYmd(target),unreadable=all.filter(g=>!parseCheckinDate(g.checkin)).length;
    rows=all.filter(g=>parseCheckinDate(g.checkin)===targetYmd);
    reportInfo={total:all.length,unreadable,label:tomorrowLabel(target),headers};render();
  };
  const sendBtn=$("#sendSmsBatch");if(sendBtn)sendBtn.onclick=send;
  const saveCodes=$("#saveKeySafeCodes");if(saveCodes)saveCodes.onclick=saveKeySafeCodes;
  const showCodes=$("#showKeySafeCodes");if(showCodes)showCodes.onclick=toggleKeySafeCodes;
  loadKeySafeCodes();checkSmsStatus();
})();
