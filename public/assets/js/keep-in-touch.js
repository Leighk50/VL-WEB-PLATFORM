(()=>{
  const form=document.getElementById('keepInTouchForm');if(!form)return;
  const message=document.getElementById('kitMessage'),btn=document.getElementById('kitSubmit');
  form.addEventListener('submit',async e=>{
    e.preventDefault();message.className='';message.textContent='';
    const fd=new FormData(form);
    const interests=[...form.querySelectorAll('input[name="interests"]:checked')].map(x=>x.value);
    const body={name:String(fd.get('name')||'').trim(),email:String(fd.get('email')||'').trim(),mobile:String(fd.get('mobile')||'').trim(),postcode:String(fd.get('postcode')||'').trim(),interests,website:String(fd.get('website')||''),marketingConsent:document.getElementById('kitConsent').checked};
    if(!interests.length){message.className='kit-error';message.textContent='Please choose at least one interest.';return;}
    btn.disabled=true;btn.textContent='Joining…';
    try{
      const r=await fetch('/api/keep-in-touch/signup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Unable to register just now.');
      form.reset();message.className='kit-success';message.innerHTML='<strong>Thank you.</strong> You’re on the Village Limits list. We’ll keep you updated with offers and what’s happening that match your interests.';
    }catch(err){message.className='kit-error';message.textContent=err.message;}finally{btn.disabled=false;btn.textContent='Keep me updated';}
  });
})();
