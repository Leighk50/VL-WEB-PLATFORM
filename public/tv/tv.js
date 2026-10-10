(function () {
'use strict';
var room=VL_ROOM_ID,origin=VL_SERVER_ORIGIN.replace(/\/$/,''),preview=typeof tizen==='undefined';
if(preview){var match=location.search.match(/[?&]room=([1-6])(?:&|$)/);if(match)room=Number(match[1]);}
var url=origin+'/api/tv/rooms/'+room+'/content',cacheKey='vl-cloud-room-'+room,data=null,view='welcome',selected=0,menuIndex=0,busy=false,mode='menu',tvToken=0,tvTimer=null,noticeUntil=0;
var nav=document.getElementById('nav'),buttons=nav.getElementsByTagName('button'),panel=document.getElementById('content'),status=document.getElementById('status'),clip=document.getElementById('clip');
function node(tag,value,cls){var el=document.createElement(tag);el.textContent=value||'';if(cls)el.className=cls;return el;}
function say(text){status.textContent=text;noticeUntil=Date.now()+15000;}
function message(title,text){panel.appendChild(node('h1',title));if(text)panel.appendChild(node('p',text,'lead'));}
function action(label,fn,cls){var el=node('button',label,cls||'action');el.setAttribute('data-action','yes');el.onclick=fn;return el;}
function focus(i){selected=(i+buttons.length)%buttons.length;buttons[selected].focus();}
function navFor(name){for(var i=0;i<buttons.length;i++)if(buttons[i].getAttribute('data-view')===name)return i;return 0;}
function heading(label,title,text){panel.appendChild(node('div',label,'eyebrow'));message(title,text);}
function price(value){if(!value)return '';return /^\d+(\.\d+)?$/.test(value)?'£'+value:value;}
function tile(symbol,title,detail,name){var el=action('',function(){open(navFor(name));},'tile');el.appendChild(node('span',symbol,'tile-symbol'));el.appendChild(node('strong',title));el.appendChild(node('small',detail));return el;}
function render(){
 var scroll=panel.scrollTop,active=document.activeElement,actionIndex=-1,oldActions=panel.querySelectorAll('[data-action]');
 for(var a=0;a<oldActions.length;a++)if(oldActions[a]===active)actionIndex=a;
 while(panel.firstChild)panel.removeChild(panel.firstChild);
 for(var b=0;b<buttons.length;b++){var isActive=buttons[b].getAttribute('data-view')===view;buttons[b].className=isActive?'active':'';buttons[b].setAttribute('aria-current',isActive?'page':'false');}
 if(data)document.getElementById('room').textContent=data.room.label.toUpperCase();
 if(view==='welcome'){
  heading('YOUR STAY, YOUR WAY',data?data.pages[0].title:'Make yourself at home','A little comfort. A good meal. Something to look forward to.');
  var copy=node('div','','welcome-copy');copy.appendChild(node('p',data?data.pages[0].text:'Hotel information is temporarily unavailable. Please speak to our team.'));panel.appendChild(copy);
  var tiles=node('div','','tiles');tiles.appendChild(tile('▣','Watch TV','Your room channels','live'));tiles.appendChild(tile('▶','Movies / Airtime','Settle in for a film','movies'));tiles.appendChild(tile('◷','Dining','Menus & service times','dining'));panel.appendChild(tiles);
 }else if(view==='live'){
  heading('ROOM ENTERTAINMENT','Watch TV',preview?'Live TV is available on the room television.':'Watch your room’s television channels. Press Return to come back to the hotel menu.');
  panel.appendChild(action('Watch TV',startLive));
 }else if(view==='movies'){
  heading('A NIGHT IN','Movies / Airtime','Choose a film in your room’s installed Airtime app.');
  panel.appendChild(action('Open Airtime',launchMovies));
 }else if(view==='videos'){
  heading('DISCOVER THE VILLAGE LIMITS','Video clips','A closer look at what’s happening here.');
  var videos=data&&data.videos||[];
  if(!videos.length)panel.appendChild(node('p','New clips will appear here when they are added.'));
  videos.forEach(function(video){panel.appendChild(action('▶ '+video.title,function(){playVideo(video);}));});
 }else if(!data){message('Connecting to hotel information','Please try again shortly. Watch TV and Airtime remain available from the menu.');
 }else if(view==='dining'){
  heading('AT OUR TABLE','Dining',data.contact.openingHours);
  if(!data.menus.length){panel.appendChild(node('p','Please ask our team about current menus.'));}
  else{
   if(menuIndex>=data.menus.length)menuIndex=0;
   var tabs=node('div','','tabs');data.menus.forEach(function(menu,index){var tab=action(menu.name,function(){menuIndex=index;panel.scrollTop=0;render();panel.querySelectorAll('[data-action]')[index].focus();});if(index===menuIndex)tab.className='chosen';tabs.appendChild(tab);});panel.appendChild(tabs);
   var menu=data.menus[menuIndex];if(menu.description)panel.appendChild(node('p',menu.description));
   menu.sections.forEach(function(section){panel.appendChild(node('h2',section.name,'section-name'));section.items.forEach(function(item){var row=node('div','','item');row.appendChild(node('span',price(item.price),'price'));row.appendChild(node('strong',item.name));if(item.description)row.appendChild(node('p',item.description));if(item.allergens)row.appendChild(node('p','Allergens: '+item.allergens,'allergens'));panel.appendChild(row);});});
  }
 }else if(view==='events'){
  heading('GOOD TIMES AHEAD',"What's on",'Food, entertainment and evenings worth coming out for.');
  data.events.forEach(function(event){var card=node('article','','event-card');if(event.image&&/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(event.image)){var img=document.createElement('img');img.src=origin+event.image;img.alt='';img.onerror=function(){this.style.display='none';};card.appendChild(img);}card.appendChild(node('h2',event.title));card.appendChild(node('div',event.date||event.startDate,'date'));card.appendChild(node('p',event.description));if(event.soldOut||event.price)card.appendChild(node('span',event.soldOut?'Currently sold out':price(event.price),'badge'));panel.appendChild(card);});
  if(!data.events.length)panel.appendChild(node('p','Please ask our team about forthcoming events.'));
 }else{
  heading('MAKE YOURSELF AT HOME','Your stay','We’re here to help you enjoy your visit.');
  var info=node('div','','info-card');info.appendChild(node('h3','Speak to our team'));info.appendChild(node('p',data.contact.telephone?'Telephone: '+data.contact.telephone:'Please speak to a member of our team.'));panel.appendChild(info);
  var hours=node('div','','info-card');hours.appendChild(node('h3','Dining & service'));hours.appendChild(node('p',data.contact.openingHours));panel.appendChild(hours);
  panel.appendChild(node('p','Menus and events: www.villagelimits.co.uk'));
 }
 panel.scrollTop=scroll;
 var newActions=panel.querySelectorAll('[data-action]');if(actionIndex>=0&&newActions[actionIndex])newActions[actionIndex].focus();
}
function launchMovies(){if(preview){say('Airtime opens on the room TV. It is not available in the browser preview.');return;}try{tizen.application.getAppsInfo(function(apps){var id=null;for(var i=0;i<apps.length;i++)if(apps[i].name.toLowerCase()==='airtime'){id=apps[i].id;break;}if(!id){say('Airtime is not installed on this TV.');return;}tizen.application.launch(id,function(){},function(e){say('Unable to open Airtime: '+e.name);});},function(e){say('Unable to find Airtime: '+e.name);});}catch(e){say('Unable to open Airtime: '+e.message);}}
function hideWindow(){if(preview||!tizen.tvwindow)return;try{tizen.tvwindow.hide(function(){},function(e){say('TV window could not close: '+e.name);},'MAIN');}catch(e){say('TV window could not close: '+e.name);}}
function stopLive(){var was=mode==='tv'||mode==='tv-loading';if(!was)return;tvToken++;clearTimeout(tvTimer);mode='menu';document.body.className='';document.documentElement.className='';document.getElementById('live-overlay').className='hidden';if(was)hideWindow();}
function tvFailed(e,token){if(token!==tvToken)return;stopLive();say('Watch TV could not open: '+(e&&e.name||e&&e.message||'TV source unavailable')+'. Return keeps the hotel menu open.');}
function startLive(){
 if(preview){say('Watch TV is available on the room TV. Return will bring you back to this menu.');return;}
 if(mode!=='menu')return;
 if(!tizen.tvwindow||!tizen.systeminfo){say('Live TV is not available through this app on this television.');return;}
 mode='tv-loading';var token=++tvToken;say('Opening live TV…');
 tvTimer=setTimeout(function(){tvFailed({name:'TV response timed out'},token);},12000);
 function show(){if(token!==tvToken)return;try{tizen.tvwindow.show(function(){if(token!==tvToken){if(mode!=='tv'&&mode!=='tv-loading')hideWindow();return;}clearTimeout(tvTimer);mode='tv';document.documentElement.className='live';document.body.className='live';document.getElementById('live-overlay').className='';document.getElementById('live-return').focus();},function(e){tvFailed(e,token);},['0%','0%','100%','100%'],'MAIN','BEHIND');}catch(e){tvFailed(e,token);}}
 try{var source=tizen.tvwindow.getSource('MAIN');if(source&&source.type==='TV'){show();return;}
 tizen.systeminfo.getPropertyValue('VIDEOSOURCE',function(sources){if(token!==tvToken)return;var tuner=null;for(var i=0;i<sources.connected.length;i++)if(sources.connected[i].type==='TV'){tuner=sources.connected[i];break;}if(!tuner){tvFailed({name:'No TV tuner source found'},token);return;}try{tizen.tvwindow.setSource(tuner,show,function(e){tvFailed(e,token);},'MAIN');}catch(e){tvFailed(e,token);}},function(e){tvFailed(e,token);});
 }catch(e){tvFailed(e,token);}
}
function stopVideo(){clip.pause();clip.removeAttribute('src');clip.load();document.getElementById('video-overlay').className='hidden';if(mode==='video'){mode='menu';document.body.className='';}}
function playRejected(){document.getElementById('clip-status').textContent='Press OK to play. If playback fails, press Return.';}
function playClip(){try{var attempt=clip.play();if(attempt&&attempt.catch)attempt.catch(playRejected);}catch(e){playRejected();}}
function playVideo(video){if(!/^https:\/\//i.test(video.url)){say('This clip needs an HTTPS video address.');return;}stopLive();stopVideo();mode='video';document.body.className='playing';document.getElementById('video-overlay').className='';document.getElementById('clip-title').textContent=video.title;document.getElementById('clip-status').textContent='Loading…';clip.src=video.url;document.getElementById('video-return').focus();playClip();}
clip.addEventListener('playing',function(){document.getElementById('clip-status').textContent='Playing';});
clip.addEventListener('pause',function(){if(mode==='video')document.getElementById('clip-status').textContent='Paused · OK to continue';});
clip.addEventListener('waiting',function(){document.getElementById('clip-status').textContent='Buffering…';});
clip.addEventListener('error',function(){if(mode==='video')document.getElementById('clip-status').textContent='Clip could not play. Press Return to go back.';});
clip.addEventListener('ended',function(){stopVideo();open(navFor('videos'));});
function open(i){stopLive();if(mode==='video')stopVideo();focus(i);view=buttons[i].getAttribute('data-view');panel.scrollTop=0;render();if(view==='live')startLive();else if(view==='movies')launchMovies();}
for(var i=0;i<buttons.length;i++)(function(index){buttons[index].onclick=function(){open(index);};})(i);
document.getElementById('live-return').onclick=function(){stopLive();open(0);};
document.getElementById('video-return').onclick=function(){stopVideo();open(navFor('videos'));};
document.addEventListener('focusin',function(e){document.getElementById('help').textContent=e.target.parentNode===nav?'▲ ▼ Menu · OK Open · ▶ Explore · Return Welcome':'▲ ▼ Scroll · ◀ ▶ Choose · OK Open · Return Welcome';});
function isBack(k){return k===10009||k===27||k===8;}
document.addEventListener('keydown',function(e){var k=e.keyCode;
 if(mode==='tv'||mode==='tv-loading'){if(isBack(k)||k===13&&mode==='tv'){stopLive();open(0);e.preventDefault();}return;}
 if(mode==='video'){if(isBack(k)){stopVideo();open(navFor('videos'));}else if(k===13||k===10252){if(clip.paused)playClip();else clip.pause();}else if(k===415)playClip();else if(k===19)clip.pause();else if(k===413){stopVideo();open(navFor('videos'));}else if(k===37||k===39){if(isFinite(clip.duration)&&clip.duration>0)clip.currentTime=Math.max(0,Math.min(clip.duration,clip.currentTime+(k===37?-10:10)));}else return;e.preventDefault();return;}
 if(isBack(k)){open(0);e.preventDefault();return;}
 var active=document.activeElement,inNav=active&&active.parentNode===nav,actions=panel.querySelectorAll('[data-action]'),n=-1;for(var j=0;j<actions.length;j++)if(active===actions[j])n=j;
 if(k===13){if(inNav)open(selected);else if(n>=0)actions[n].click();e.preventDefault();}
 else if(inNav&&(k===38||k===40)){focus(selected+(k===38?-1:1));e.preventDefault();}
 else if(inNav&&k===39){if(actions.length)actions[0].focus();else panel.focus();e.preventDefault();}
 else if(k===37){if(n>0)actions[n-1].focus();else focus(selected);e.preventDefault();}
 else if(k===39&&n>=0){actions[(n+1)%actions.length].focus();e.preventDefault();}
 else if(k===38||k===40){panel.scrollTop+=(k===38?-1:1)*Math.max(100,panel.clientHeight*.35);e.preventDefault();}
});
function valid(value){return value&&value.schemaVersion===1&&value.room&&value.room.id===room&&Array.isArray(value.pages)&&value.pages.length===3&&value.pages.every(function(p){return typeof p.title==='string'&&typeof p.text==='string';})&&Array.isArray(value.menus)&&Array.isArray(value.events)&&value.contact;}
function poll(){if(busy)return;busy=true;var xhr=new XMLHttpRequest();xhr.open('GET',url+'?v='+Date.now()+(preview?'&preview=1':''),true);xhr.timeout=10000;
 function failed(){busy=false;if(Date.now()>noticeUntil)status.textContent=data?'Offline · showing saved hotel information':'Hotel information unavailable · retrying automatically';}
 xhr.onerror=failed;xhr.ontimeout=failed;xhr.onload=function(){busy=false;try{if(xhr.status===404){data=null;try{localStorage.removeItem(cacheKey);}catch(ignore){}say('Cloud content is not enabled for this room.');render();return;}if(xhr.status!==200)throw Error('HTTP '+xhr.status);var next=JSON.parse(xhr.responseText);if(!valid(next))throw Error('Invalid hotel content');var changed=!data||data.revision!==next.revision;data=next;try{localStorage.setItem(cacheKey,JSON.stringify(data));}catch(ignore){}if(Date.now()>noticeUntil)status.textContent='Updated '+new Date().toLocaleTimeString();if(changed&&mode==='menu')render();}catch(e){failed();}};try{xhr.send();}catch(e){failed();}}
try{var cached=JSON.parse(localStorage.getItem(cacheKey));if(valid(cached)){data=cached;status.textContent='Showing saved hotel information · connecting…';}}catch(ignore){}
try{if(!preview&&tizen.tvinputdevice)['MediaPlayPause','MediaPlay','MediaPause','MediaStop'].forEach(function(key){try{tizen.tvinputdevice.registerKey(key);}catch(ignore){}});}catch(ignore){}
function clock(){document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}clock();setInterval(clock,10000);
focus(0);render();poll();setInterval(poll,30000);
document.addEventListener('visibilitychange',function(){if(document.hidden){stopLive();if(mode==='video')stopVideo();}else{open(0);poll();}});
window.addEventListener('pagehide',function(){stopLive();if(mode==='video')stopVideo();});
})();
