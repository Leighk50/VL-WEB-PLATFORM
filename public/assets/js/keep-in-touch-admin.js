(()=>{
  const panel=document.getElementById('panel-keep-in-touch');if(!panel)return;
  const rows=document.getElementById('keepInTouchRows'),meta=document.getElementById('keepInTouchMeta');
  const campaignStatus=document.getElementById('kitCampaignStatus');
  let state=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opts={}){const r=await fetch(url,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const j=await r.json().catch(()=>({}));if(r.status===401){location.href='/admin';throw new Error('Session expired.');}if(!r.ok)throw new Error(j.error||`Request failed (${r.status})`);return j;}
  function render(j){
    state=j;
    meta.textContent=`${j.activeCount||0} active contacts · ${j.count||0} total registrations · SMS ${j.smsConfigured?'ready':'not configured'} · Email ${j.emailConfigured?'ready':'not configured'}`;
    rows.innerHTML=(j.entries||[]).length?`<div class="admin-card" style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:860px"><thead><tr><th style="text-align:left">Name</th><th style="text-align:left">Email</th><th style="text-align:left">Mobile</th><th style="text-align:left">Consent date</th><th style="text-align:left">Status</th></tr></thead><tbody>${j.entries.map(e=>`<tr style="border-top:1px solid #ddd"><td>${esc(e.name)}</td><td><a href="mailto:${esc(e.email)}">${esc(e.email)}</a></td><td>${esc(e.mobile)}</td><td>${esc(e.consentAt?new Date(e.consentAt).toLocaleString():'')}</td><td>${e.unsubscribedAt?'<strong style="color:#a33">Unsubscribed</strong>':'<strong style="color:#386b42">Active</strong>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-card"><p>No registrations yet.</p></div>';
    const history=(j.campaigns||[]);
    if(history.length){rows.insertAdjacentHTML('beforeend',`<div class="admin-card" style="margin-top:18px"><h3>Recent campaigns</h3>${history.map(c=>`<div style="border-top:1px solid #ddd;padding:10px 0"><strong>${esc(c.subject||'SMS campaign')}</strong> · ${esc(new Date(c.sentAt).toLocaleString())}<br><small>${c.channels?.email?`Email: ${c.email?.sent||0} sent, ${c.email?.failed||0} failed`:''}${c.channels?.email&&c.channels?.sms?' · ':''}${c.channels?.sms?`SMS: ${c.sms?.sent||0} sent, ${c.sms?.failed||0} failed`:''}</small></div>`).join('')}</div>`);}
  }
  async function load(){try{meta.textContent='Loading…';render(await api('/api/admin/keep-in-touch'));}catch(e){meta.textContent=e.message;}}
  async function sendCampaign(){
    const btn=document.getElementById('kitSendCampaign');const subject=document.getElementById('kitCampaignSubject').value.trim();const message=document.getElementById('kitCampaignMessage').value.trim();const sendEmail=document.getElementById('kitSendEmail').checked;const sendSms=document.getElementById('kitSendSms').checked;const smsSender=document.getElementById('kitSmsSender').value;
    if(!sendEmail&&!sendSms){campaignStatus.textContent='Choose email, SMS, or both.';return;}
    if(!message){campaignStatus.textContent='Enter a campaign message.';return;}
    if(sendEmail&&!subject){campaignStatus.textContent='Enter an email subject.';return;}
    const count=state?.activeCount||0;if(!count){campaignStatus.textContent='There are no active opted-in recipients.';return;}
    const channels=[sendEmail?'email':'',sendSms?'SMS':''].filter(Boolean).join(' + ');
    if(!confirm(`Send this ${channels} campaign to ${count} opted-in contact${count===1?'':'s'}?\n\nThis will send immediately.`))return;
    btn.disabled=true;campaignStatus.textContent=`Sending to ${count} contact${count===1?'':'s'}…`;
    try{
      const r=await api('/api/admin/keep-in-touch/campaign',{method:'POST',body:JSON.stringify({subject,message,sendEmail,sendSms,smsSender})});
      const parts=[];if(sendEmail)parts.push(`Email: ${r.email.sent} sent${r.email.failed?`, ${r.email.failed} failed`:''}`);if(sendSms)parts.push(`SMS: ${r.sms.sent} sent${r.sms.failed?`, ${r.sms.failed} failed`:''}`);campaignStatus.textContent=`Campaign complete. ${parts.join(' · ')}`;await load();
    }catch(e){campaignStatus.textContent=e.message;}finally{btn.disabled=false;}
  }
  document.getElementById('refreshKeepInTouch')?.addEventListener('click',load);
  document.getElementById('kitSendCampaign')?.addEventListener('click',sendCampaign);
  document.querySelector('[data-panel="keep-in-touch"]')?.addEventListener('click',()=>setTimeout(load,0));
})();
