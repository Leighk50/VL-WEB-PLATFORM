(()=>{
  const panel=document.getElementById('panel-keep-in-touch');if(!panel)return;
  const rows=document.getElementById('keepInTouchRows'),meta=document.getElementById('keepInTouchMeta');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load(){try{meta.textContent='Loading…';const r=await fetch('/api/admin/keep-in-touch',{credentials:'same-origin'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Could not load signups.');meta.textContent=`${j.count||0} people registered`;rows.innerHTML=(j.entries||[]).length?`<div class="admin-card" style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr><th style="text-align:left">Name</th><th style="text-align:left">Email</th><th style="text-align:left">Mobile</th><th style="text-align:left">Consent date</th></tr></thead><tbody>${j.entries.map(e=>`<tr style="border-top:1px solid #ddd"><td>${esc(e.name)}</td><td><a href="mailto:${esc(e.email)}">${esc(e.email)}</a></td><td>${esc(e.mobile)}</td><td>${esc(e.consentAt?new Date(e.consentAt).toLocaleString():'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-card"><p>No registrations yet.</p></div>';}
    catch(e){meta.textContent=e.message;}}
  document.getElementById('refreshKeepInTouch')?.addEventListener('click',load);
  document.querySelector('[data-panel="keep-in-touch"]')?.addEventListener('click',()=>setTimeout(load,0));
})();
