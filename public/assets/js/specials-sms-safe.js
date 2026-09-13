(()=>{
  const panel=document.getElementById('panel-specials-sms');
  if(!panel)return;
  const statusEl=document.getElementById('specialsSmsStatus');
  const metaEl=document.getElementById('specialsSmsMeta');
  const editor=document.getElementById('specialsSmsEditor');
  const raw=document.getElementById('specialsSmsRaw');
  let draft=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opts={}){const r=await fetch(url,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const j=await r.json().catch(()=>({}));if(r.status===401){location.href='/admin';throw new Error('Session expired.')}if(!r.ok)throw new Error(j.error||`Request failed (${r.status})`);return j}
  function setStatus(msg,bad=false){statusEl.textContent=msg||'';statusEl.style.color=bad?'#9b1c1c':''}
  function render(){
    if(!draft){editor.innerHTML='<div class="admin-card"><p>No specials draft has been received yet.</p></div>';return}
    raw.value=draft.sourceText||'';
    editor.innerHTML=`<div class="admin-card"><p><strong>Status:</strong> ${esc(draft.status||'draft')} &nbsp; <strong>Parser:</strong> ${esc(draft.parser||'rules')} &nbsp; <strong>Received:</strong> ${esc(draft.receivedAt?new Date(draft.receivedAt).toLocaleString():'')}</p></div>`+(draft.sections||[]).map((s,si)=>`<section class="admin-card" data-special-section="${si}" style="margin-top:16px"><label>Section name<input data-section-name value="${esc(s.name)}"></label>${(s.items||[]).map((i,ii)=>`<div class="admin-card" data-special-item="${si}:${ii}" style="margin:12px 0"><div class="row-2"><label>Dish name<input data-field="name" value="${esc(i.name)}"></label><label>Price<input data-field="price" value="${esc(i.price)}" placeholder="£12"></label></div><label>Description<textarea data-field="description">${esc(i.description)}</textarea></label><label>Allergens<input data-field="allergens" value="${esc(i.allergens)}"></label>${(i.warnings||[]).length?`<div class="form-error" data-warning-box><strong>Needs confirmation</strong><ul>${i.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul><button type="button" class="small-btn" data-confirm-warnings>Confirmed / reviewed</button></div>`:''}</div>`).join('')}<button type="button" class="small-btn" data-add-item="${si}">Add dish</button></section>`).join('');
  }
  function collect(){
    if(!draft)throw new Error('There is no draft to save.');
    const sections=[];
    editor.querySelectorAll('[data-special-section]').forEach(sectionEl=>{
      const s={name:sectionEl.querySelector('[data-section-name]').value.trim(),items:[]};
      sectionEl.querySelectorAll('[data-special-item]').forEach(itemEl=>{
        const [si,ii]=itemEl.dataset.specialItem.split(':').map(Number);const old=draft.sections?.[si]?.items?.[ii]||{};
        const get=f=>itemEl.querySelector(`[data-field="${f}"]`).value.trim();
        s.items.push({id:old.id,name:get('name'),description:get('description'),price:get('price'),allergens:get('allergens'),visible:true,warnings:Array.isArray(old.warnings)?old.warnings:[]});
      });
      sections.push(s);
    });
    return sections;
  }
  async function refresh(){
    try{
      setStatus('Loading…');
      const [status,draftData]=await Promise.all([api('/api/admin/specials-sms/status'),api('/api/admin/specials-sms/draft')]);
      draft=draftData.draft||null;
      metaEl.innerHTML=`<strong>Chef numbers configured:</strong> ${status.configuredChefNumbers||0} &nbsp; <strong>AI parser:</strong> ${status.aiConfigured?'Configured':'Rules fallback only'} &nbsp; <strong>Webhook protection:</strong> ${status.webhookSecretConfigured?'Configured':'Not configured'}`;
      render();setStatus('');
    }catch(e){setStatus(e.message,true)}
  }
  async function save(){try{draft.sections=collect();const data=await api('/api/admin/specials-sms/draft',{method:'PUT',body:JSON.stringify({sections:draft.sections})});draft=data.draft;render();setStatus('Draft saved.')}catch(e){setStatus(e.message,true)}}
  async function publish(){try{await save();if(!confirm('Publish these specials to the live website?'))return;const data=await api('/api/admin/specials-sms/publish',{method:'POST',body:'{}'});setStatus(`Published ${data.menu?.sections?.reduce((n,s)=>n+(s.items?.length||0),0)||0} specials to the website.`);await refresh()}catch(e){setStatus(e.message,true)}}
  async function parseManual(){try{const text=raw.value.trim();if(!text)throw new Error('Paste or type a specials message first.');setStatus('Parsing specials…');const data=await api('/api/admin/specials-sms/parse',{method:'POST',body:JSON.stringify({text})});draft=data.draft;render();setStatus(`Parsed using ${draft.parser}. Review before publishing.`)}catch(e){setStatus(e.message,true)}}
  editor.addEventListener('click',e=>{
    const confirmBtn=e.target.closest('[data-confirm-warnings]');if(confirmBtn){const itemEl=confirmBtn.closest('[data-special-item]');const [si,ii]=itemEl.dataset.specialItem.split(':').map(Number);if(draft?.sections?.[si]?.items?.[ii])draft.sections[si].items[ii].warnings=[];itemEl.querySelector('[data-warning-box]')?.remove();setStatus('Warning marked as reviewed. Save before publishing.');return}
    const add=e.target.closest('[data-add-item]');if(add){const si=Number(add.dataset.addItem);draft.sections[si].items.push({id:`manual-${Date.now()}`,name:'',description:'',price:'',allergens:'',visible:true,warnings:[]});render()}
  });
  document.getElementById('refreshSpecialsSms')?.addEventListener('click',refresh);
  document.getElementById('parseSpecialsSms')?.addEventListener('click',parseManual);
  document.getElementById('saveSpecialsDraft')?.addEventListener('click',save);
  document.getElementById('publishSpecialsDraft')?.addEventListener('click',publish);
  document.getElementById('printSpecialsDraft')?.addEventListener('click',()=>window.open('/admin/specials/print','_blank','noopener'));
  document.querySelector('[data-panel="specials-sms"]')?.addEventListener('click',()=>setTimeout(refresh,0));
})();
