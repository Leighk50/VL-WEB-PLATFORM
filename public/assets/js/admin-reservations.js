(()=>{
  'use strict';
  const $=s=>document.querySelector(s),form=$('#reservationForm'),date=$('#reservationDate');
  if(!form)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=null,availability=[],generation=0;
  const message=text=>{$('#reservationMessage').textContent=text;};
  async function api(url,options={}){
    const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Reservation request failed.');return data;
  }
  date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function tables(){
    const selected=form.tableId.value;
    const current=availability.find(x=>x.time===form.time.value);
    form.tableId.innerHTML='<option value="">Allocate automatically</option>'+(current?.tables||[]).map(t=>`<option value="${t.id}">Table ${t.id} · ${t.capacity} guests${t.dogs?' · dog-friendly':''}</option>`).join('');
    if([...form.tableId.options].some(x=>x.value===selected))form.tableId.value=selected;
  }
  async function refreshAvailability(){
    const ticket=++generation,selected=form.time.value;
    const params=new URLSearchParams({date:date.value,covers:form.covers.value,dogs:String(form.dogs.checked),ignoreId:form.elements.id.value});
    form.querySelector('[type=submit]').disabled=true;
    try{
      const data=await api('/api/admin/reservations/availability?'+params);
      if(ticket!==generation)return;
      availability=data.slots;
      form.time.innerHTML=availability.map(x=>`<option value="${x.time}" ${x.tables.length?'':'disabled'}>${x.time}${x.tables.length?'':' · unavailable'}</option>`).join('');
      if(availability.some(x=>x.time===selected&&x.tables.length))form.time.value=selected;
      else form.time.value=availability.find(x=>x.tables.length)?.time||'';
      tables();form.querySelector('[type=submit]').disabled=!form.time.value;
    }catch(e){if(ticket===generation){availability=[];form.time.innerHTML='';form.tableId.innerHTML='<option value="">Unavailable</option>';message(e.message);}}
  }
  function reset(){form.reset();form.elements.id.value='';$('#reservationFormTitle').textContent='New booking';return refreshAvailability();}
  function render(){
    const active=state.bookings.filter(x=>x.status!=='cancelled');
    $('#reservationSummary').textContent=`${active.reduce((n,x)=>n+x.covers,0)} covers · ${active.length} bookings · ${active.filter(x=>x.dogs).length}/2 dog bookings. Two-hour sittings; maximum 12 guests in any rolling 40-minute period.`;
    $('#reservationTables').innerHTML=state.tables.map(t=>{
      const bookings=active.filter(b=>b.tableId===t.id);
      return `<div class="admin-card"><strong>Table ${t.id}</strong><p>${t.capacity} guests${t.dogs?' · dog-friendly':''}</p>${bookings.map(b=>`<p>${esc(b.time)} · ${esc(b.name)} (${b.covers})${b.dogs?' · dog':''}</p>`).join('')||'<p>No bookings</p>'}</div>`;
    }).join('');
    $('#reservationWeekdays').innerHTML=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,day)=>`<label style="display:inline-block;margin:8px"><input name="openDays" type="checkbox" value="${day}" ${state.openDays.includes(day)?'checked':''}> ${name}</label>`).join('');
    $('#reservationBlockDate').blockedDate.value=date.value;
    $('#reservationDayStatus').textContent=state.override?.closed?'Selected date is blocked.':state.openDays.includes(new Date(date.value+'T12:00:00Z').getUTCDay())?'Selected date is normally open.':'Selected weekday is normally closed.';
    $('#reservationBlockedDates').innerHTML=state.blockedDates.map(d=>`<p>${esc(d)} <button type="button" class="btn dark" data-unblock="${d}">Remove block</button></p>`).join('')||'<p>No blocked dates.</p>';
    const service=$('#reservationService');service.lastArrival.value=state.override?.lastArrival||(new Date(date.value+'T12:00:00Z').getUTCDay()===0?'13:30':'19:30');service.closed.checked=Boolean(state.override?.closed);
    $('#reservationList').innerHTML=state.bookings.map(b=>`<article class="admin-card" style="margin-top:12px"><h3>${esc(b.time)} · ${esc(b.name)} · ${b.covers} guests · Table ${b.tableId}</h3><p>${esc(b.status.replaceAll('_',' '))}${b.dogs?' · Bringing a dog':''} · ${esc(b.phone)} ${esc(b.email)}</p><p>${esc(b.notes)}</p><p>Card: not collected${b.policyChargePence?` · Policy charge £${(b.policyChargePence/100).toFixed(2)} requires review; no charge taken`:''}</p><div>${b.status==='booked'?`<button class="btn dark" data-edit="${b.id}" type="button">Edit</button> <button class="btn" data-id="${b.id}" data-status="arrived" type="button">Arrived</button> <button class="btn dark" data-id="${b.id}" data-status="cancelled" type="button">Cancel</button> <button class="btn dark" data-id="${b.id}" data-status="no_show" type="button">No-show</button>`:b.status==='arrived'?`<button class="btn" data-id="${b.id}" data-status="completed" type="button">Completed</button>`:''}</div></article>`).join('')||'<div class="admin-card"><p>No bookings for this date.</p></div>';
  }
  async function load(){
    state=null;form.querySelector('[type=submit]').disabled=true;
    try{state=await api('/api/admin/reservations?'+new URLSearchParams({date:date.value}));render();await reset();message('Diary loaded.');}
    catch(e){message(e.message);}
  }
  async function mutate(url,method,payload){
    if(!state)throw new Error('Load the diary first.');
    await api(url,{method,body:JSON.stringify({...payload,revision:state.revision})});
    await load();message('Saved.');
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();const id=form.elements.id.value;
    try{await mutate('/api/admin/reservations'+(id?'/'+id:''),id?'PUT':'POST',{...Object.fromEntries(new FormData(form)),date:date.value,covers:Number(form.covers.value),dogs:form.dogs.checked});}
    catch(err){message(err.message);}
  });
  $('#reservationOpenDays').addEventListener('submit',async e=>{e.preventDefault();try{await mutate('/api/admin/reservations/open-days','PUT',{openDays:[...e.target.querySelectorAll('input:checked')].map(x=>Number(x.value))});}catch(err){message(err.message);}});
  $('#reservationBlockDate').addEventListener('submit',async e=>{e.preventDefault();try{await mutate('/api/admin/reservations/block-date','PUT',{date:e.target.blockedDate.value,closed:true});}catch(err){message(err.message);}});
  $('#reservationBlockedDates').addEventListener('click',async e=>{const b=e.target.closest('[data-unblock]');if(!b)return;try{await mutate('/api/admin/reservations/block-date','PUT',{date:b.dataset.unblock,closed:false});}catch(err){message(err.message);}});
  $('#reservationService').addEventListener('submit',async e=>{e.preventDefault();try{await mutate('/api/admin/reservations/service','PUT',{date:date.value,lastArrival:e.target.lastArrival.value,closed:e.target.closed.checked});}catch(err){message(err.message);}});
  $('#reservationList').addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.edit){
      const b=state?.bookings.find(x=>x.id===button.dataset.edit);if(!b)return;
      for(const key of ['id','name','phone','email','covers','notes'])form.elements[key].value=b[key];
      form.dogs.checked=b.dogs;$('#reservationFormTitle').textContent='Edit booking';
      await refreshAvailability();form.time.value=b.time;tables();form.tableId.value=String(b.tableId);form.scrollIntoView({behavior:'smooth'});return;
    }
    if(!confirm(`Record ${button.dataset.status.replaceAll('_',' ')} for this booking?`))return;
    try{await mutate('/api/admin/reservations/'+button.dataset.id+'/status','PUT',{status:button.dataset.status});}catch(err){message(err.message);}
  });
  form.covers.addEventListener('change',refreshAvailability);form.dogs.addEventListener('change',refreshAvailability);form.time.addEventListener('change',tables);
  date.addEventListener('change',load);$('#reservationReload').addEventListener('click',load);$('#reservationReset').addEventListener('click',reset);$('#reservationNew').addEventListener('click',()=>{reset();form.scrollIntoView({behavior:'smooth'});});
  document.querySelector('[data-panel="reservations"]').addEventListener('click',load);
})();
