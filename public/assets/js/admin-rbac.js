(()=>{
  const PERMS=[
    ['dashboard','Dashboard'],['enquiries','Enquiries'],['menus','Menus'],['specials','Chef Specials'],
    ['events',"What's On"],['guest_sms','Guest SMS'],['settings','Website Details']
  ];
  const PANEL_PERM={dashboard:'dashboard',enquiries:'enquiries',menus:'menus','specials-sms':'specials',events:'events',sms:'guest_sms',settings:'settings',users:'users'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let session=null;

  const style=document.createElement('style');
  style.textContent='.rbac-pending .admin-nav button,.rbac-pending .admin-panel{visibility:hidden}.rbac-user-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.rbac-perms{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0}.rbac-perms label{display:flex;gap:6px;align-items:center;font-weight:400}.rbac-user-card{margin:12px 0}.rbac-user-card[aria-disabled="true"]{opacity:.65}.rbac-user-meta{font-size:.9em;color:#666}';
  document.head.appendChild(style); document.documentElement.classList.add('rbac-pending');

  async function api(url,opts={}){
    const r=await fetch(url,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(r.status===401){location.href='/admin';throw new Error('Session expired.');}
    if(!r.ok)throw new Error(data.error||`Request failed (${r.status})`);
    return data;
  }
  function allowed(permission){return Boolean(session&&(session.isOwner||session.permissions?.includes(permission)));}
  function applyAccess(){
    document.querySelectorAll('.admin-nav [data-panel]').forEach(btn=>{
      const permission=PANEL_PERM[btn.dataset.panel];
      btn.hidden=Boolean(permission&&!allowed(permission));
      btn.style.visibility='';
    });
    document.querySelectorAll('.admin-panel').forEach(panel=>{
      const key=panel.id.replace(/^panel-/,''); const permission=PANEL_PERM[key];
      if(permission&&!allowed(permission)) panel.hidden=true;
      panel.style.visibility='';
    });
    const active=document.querySelector('.admin-nav button.active:not([hidden])');
    if(!active){
      const first=document.querySelector('.admin-nav button[data-panel]:not([hidden])');
      if(first){document.querySelectorAll('.admin-nav button').forEach(b=>b.classList.remove('active'));first.classList.add('active');document.querySelectorAll('.admin-panel').forEach(p=>p.hidden=true);const target=document.getElementById(`panel-${first.dataset.panel}`);if(target)target.hidden=false;}
    }
    const top=document.querySelector('.admin-top>div:last-child');
    if(top&&session&&!document.getElementById('rbacIdentity')){const span=document.createElement('span');span.id='rbacIdentity';span.style.marginRight='12px';span.textContent=`Signed in as ${session.displayName||session.username}`;top.prepend(span);}
    document.documentElement.classList.remove('rbac-pending');
  }
  function permissionChecks(selected=[]){
    return `<div class="rbac-perms">${PERMS.map(([id,label])=>`<label><input type="checkbox" value="${id}" ${selected.includes(id)?'checked':''}> ${esc(label)}</label>`).join('')}</div>`;
  }
  function selectedPermissions(root){return [...root.querySelectorAll('.rbac-perms input:checked')].map(i=>i.value);}
  function renderUsers(users){
    const list=document.getElementById('adminUsersList'); if(!list)return;
    if(!users.length){list.innerHTML='<div class="admin-card"><p>No additional admin users have been created yet.</p></div>';return;}
    list.innerHTML=users.map(u=>`<div class="admin-card rbac-user-card" data-rbac-user="${esc(u.username)}" aria-disabled="${u.enabled?'false':'true'}"><div class="admin-heading"><div><h3>${esc(u.displayName||u.username)}</h3><div class="rbac-user-meta">Username: ${esc(u.username)}</div></div><label style="display:flex;gap:6px;align-items:center"><input data-enabled type="checkbox" ${u.enabled?'checked':''}> Enabled</label></div><div class="rbac-user-grid"><label>Display name<input data-display-name value="${esc(u.displayName||u.username)}"></label><label>Reset password (optional)<input data-password type="password" autocomplete="new-password" placeholder="Leave blank to keep current"></label></div><div><strong>Allowed areas</strong>${permissionChecks(u.permissions||[])}</div><div class="actions"><button type="button" class="btn dark" data-save-user>Save user</button><button type="button" class="btn secondary" data-delete-user>Delete user</button></div><p class="save-status" data-user-status></p></div>`).join('');
  }
  async function loadUsers(){
    if(!session?.isOwner)return;
    try{const data=await api('/api/admin/rbac/users');renderUsers(data.users||[]);}catch(e){const s=document.getElementById('adminUsersStatus');if(s)s.textContent=e.message;}
  }
  async function createUser(e){
    e.preventDefault(); const form=e.currentTarget; const status=document.getElementById('adminUsersStatus');
    try{
      const payload={username:form.username.value.trim(),displayName:form.displayName.value.trim(),password:form.password.value,permissions:selectedPermissions(form),enabled:true};
      await api('/api/admin/rbac/users',{method:'POST',body:JSON.stringify(payload)});form.reset();if(status)status.textContent='Admin user created.';await loadUsers();
    }catch(err){if(status)status.textContent=err.message;}
  }
  async function userAction(e){
    const card=e.target.closest('[data-rbac-user]'); if(!card)return;
    const username=card.dataset.rbacUser; const status=card.querySelector('[data-user-status]');
    if(e.target.closest('[data-save-user]')){
      try{const payload={displayName:card.querySelector('[data-display-name]').value.trim(),password:card.querySelector('[data-password]').value,enabled:card.querySelector('[data-enabled]').checked,permissions:selectedPermissions(card)};await api(`/api/admin/rbac/users/${encodeURIComponent(username)}`,{method:'PUT',body:JSON.stringify(payload)});status.textContent='Saved.';await loadUsers();}catch(err){status.textContent=err.message;}
    }
    if(e.target.closest('[data-delete-user]')){
      if(!confirm(`Delete admin user ${username}?`))return;
      try{await api(`/api/admin/rbac/users/${encodeURIComponent(username)}`,{method:'DELETE'});await loadUsers();}catch(err){status.textContent=err.message;}
    }
  }
  async function init(){
    try{session=await api('/api/admin/rbac/session');applyAccess();if(session.isOwner)await loadUsers();}
    catch(e){document.documentElement.classList.remove('rbac-pending');}
  }
  document.getElementById('createAdminUser')?.addEventListener('submit',createUser);
  document.getElementById('adminUsersList')?.addEventListener('click',userAction);
  document.querySelector('[data-panel="users"]')?.addEventListener('click',()=>loadUsers());
  init();
})();
