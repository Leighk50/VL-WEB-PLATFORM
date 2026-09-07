document.addEventListener('click',e=>{if(e.target.matches('.menu-toggle'))document.querySelector('.navlinks')?.classList.toggle('open')});

document.addEventListener('DOMContentLoaded',()=>{
  const feedback=document.querySelector('.enquiry-error,.enquiry-success');
  if(!feedback)return;

  feedback.setAttribute('tabindex','-1');
  requestAnimationFrame(()=>{
    feedback.scrollIntoView({behavior:'smooth',block:'center'});
    try{feedback.focus({preventScroll:true})}catch{feedback.focus()}
  });
});
