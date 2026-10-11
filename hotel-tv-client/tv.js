(function () {
'use strict';
var room=VL_ROOM_ID,origin=VL_SERVER_ORIGIN.replace(/\/$/,''),preview=typeof tizen==='undefined';
if(preview){var match=location.search.match(/[?&]room=([1-6])(?:&|$)/);if(match)room=Number(match[1]);}
var url=origin+'/api/tv/rooms/'+room+'/content',cacheKey='vl-cloud-room-'+room,data=null,view='welcome',selected=0,menuIndex=0,busy=false,mode='menu',tvToken=0,tvTimer=null,noticeUntil=0,diagApps=null,diagPage=0,diagAll=false,diagLog=[],diagKeys=[],diagRegistered=[],diagResume=false,guideCode=458,embeddedGuideResume=false,embeddedResumeTimer=null;
var nav=document.getElementById('nav'),buttons=nav.getElementsByTagName('button'),panel=document.getElementById('content'),status=document.getElementById('status'),clip=document.getElementById('clip');
function node(tag,value,cls){var el=document.createElement(tag);el.textContent=value||'';if(cls)el.className=cls;return el;}
function say(text){status.textContent=text;noticeUntil=Date.now()+15000;}
function message(title,text){panel.appendChild(node('h1',title));if(text)panel.appendChild(node('p',text,'lead'));}
function action(label,fn,cls){var el=node('button',label,cls||'action');el.setAttribute('data-action','yes');el.onclick=fn;return el;}
function focus(i){selected=(i+buttons.length)%buttons.length;buttons[selected].focus();}
function navFor(name){for(var i=0;i<buttons.length;i++)if(buttons[i].getAttribute('data-view')===name)return i;return 0;}
function heading(label,title,text){panel.appendChild(node('div',label,'eyebrow'));message(title,text);}
function price(value){if(!value)return '';return /^\d+(\.\d+)?$/.test(value)?'£'+value:value;}
function tile(symbol,title,detail,name){var el=action('',function(){open(navFor(name));},'tile');var mark=node('span','','tile-symbol');var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('aria-hidden','true');var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',name==='live'?'M4 5h16v12H4z M8 21h8 M12 17v4':name==='movies'?'M8 5l12 7-12 7z':'M5 3v6 M8 3v6 M11 3v6 M5 9h6 M8 9v12 M18 3v18 M18 3c-4 3-4 8 0 8');svg.appendChild(path);mark.appendChild(svg);el.appendChild(mark);el.appendChild(node('strong',title));el.appendChild(node('small',detail));return el;}
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
  heading('ROOM ENTERTAINMENT','Watch TV',preview?'Live TV is available on the room television.':'Open Samsung TV for channels and the programme guide. Return-to-menu behaviour is being tested on Room 3.');
  panel.appendChild(action('Watch TV inside widget — Room 3 test',startEmbeddedTV));
  panel.appendChild(action('Watch TV — native screen',startLive));
  panel.appendChild(action('TV Guide',launchGuide));
 }else if(view==='movies'){
  heading('A NIGHT IN','Movies / Airtime','Choose a film in your room’s installed Airtime app.');
  panel.appendChild(action('Open Airtime',launchMovies));
 }else if(view==='videos'){
  heading('DISCOVER THE VILLAGE LIMITS','Video clips','A closer look at what’s happening here.');
  var videos=data&&data.videos||[];
  if(!videos.length)panel.appendChild(node('p','New clips will appear here when they are added.'));
  videos.forEach(function(video){panel.appendChild(action('▶ '+video.title,function(){playVideo(video);}));});
 }else if(view==='diagnostics'){renderDiagnostics();
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
function diagRecord(text){diagLog.push(new Date().toLocaleTimeString()+' · '+text);if(diagLog.length>100)diagLog.shift();try{sessionStorage.setItem('vl-epg-log',JSON.stringify(diagLog));}catch(ignore){}var log=document.getElementById('diag-log');if(log)log.textContent=diagLog.join('\n');}
function diagCandidate(app){var label=(app.name+' '+app.id).toLowerCase();return /guide|epg|channel[-_ ]?list|ep-hotel-channel$/.test(label)&&!/service|daemon|editor|manager/.test(label);}
function diagKeyMode(enable){
 // GUIDE registration is retained for this pilot, including while hidden.
 if(preview||!tizen.tvinputdevice||!enable)return;
 try{diagKeys=tizen.tvinputdevice.getSupportedKeys();}catch(e){diagRecord('Key discovery: '+e.name);}
}
function scanDiagnosticApps(){
 if(preview){diagRecord('Installed apps can only be read on the TV.');return;}
 diagRecord('Reading installed applications…');
 try{tizen.application.getAppsInfo(function(apps){diagApps=apps.map(function(a){return {name:a.name||'(unnamed)',id:a.id};}).sort(function(a,b){return (a.name+' '+a.id).localeCompare(b.name+' '+b.id);});diagPage=0;diagRecord('Found '+diagApps.length+' installed apps.');if(view==='diagnostics')render();},function(e){diagRecord('App discovery failed: '+e.name);});}catch(e){diagRecord('App discovery failed: '+e.message);}
}
function diagLaunch(app){
 if(preview)return;
 diagResume=true;diagRecord('Launching '+app.id);
 try{tizen.application.launch(app.id,function(){diagRecord('Launch accepted: '+app.id);},function(e){diagResume=false;diagRecord('Launch failed: '+app.id+' — '+e.name);});}catch(e){diagResume=false;diagRecord('Launch failed: '+e.message);}
}
function launchGuide(){
 if(preview){say('TV Guide opens on the room television.');return;}
 embeddedGuideResume=mode==='tv-embedded';stopLive();if(mode==='video')stopVideo();
 diagRecord('Opening EPG; widget '+(document.hidden?'hidden':'visible'));
 try{tizen.application.launch('org.tizen.epg',function(){diagRecord('EPG launch accepted');},function(e){embeddedGuideResume=false;diagRecord('EPG launch failed: '+e.name);say('Unable to open TV Guide: '+e.name);});}catch(e){embeddedGuideResume=false;diagRecord('EPG launch failed: '+(e.name||e.message));say('Unable to open TV Guide: '+(e.name||e.message));}
}
var channelBusy=false,channelTimer=null;
function tunerError(label,e){diagRecord(label+': '+(e&&e.name||'UnknownError')+(e&&e.message?' — '+e.message:''));}
function tunerValue(label,value){var text;try{text=JSON.stringify(value);}catch(e){text=String(value);}diagRecord(label+': '+(text===undefined?'no synchronous result':text.slice(0,1800)));}
function readTunerData(){
 if(preview||!tizen.tvchannel){diagRecord('TV channel API unavailable');return;}
 var api=tizen.tvchannel;diagRecord('Reading tuner data 0.4.1');
 try{tunerValue('Current channel',api.getCurrentChannel());}catch(e){tunerError('Current channel failed',e);}
 try{tunerValue('Current programme',api.getCurrentProgram());}catch(e){tunerError('Current programme failed',e);}
 var done=false,timer=setTimeout(function(){if(!done){done=true;diagRecord('Channel list: no callback after 8 seconds');}},8000);
 try{api.getChannelList(function(channels){if(done)return;done=true;clearTimeout(timer);diagRecord('Channel list received: '+channels.length);channels.slice(0,10).forEach(function(c){tunerValue('Channel',c);});},function(e){if(done)return;done=true;clearTimeout(timer);tunerError('Channel list failed',e);},'ALL',0,10);}catch(e){done=true;clearTimeout(timer);tunerError('Channel list failed',e);}
}
function changeEmbeddedChannel(up){
 if(preview||mode!=='tv-embedded'||document.hidden||channelBusy)return;
 var api=tizen.tvchannel,method=up?'tuneUp':'tuneDown';
 if(!api||typeof api[method]!=='function'){diagRecord(method+': unavailable');return;}
 channelBusy=true;var token=tvToken,done=false;diagRecord('Request '+method+'; widget visible');
 function finish(){done=true;clearTimeout(channelTimer);channelTimer=null;channelBusy=false;}
 channelTimer=setTimeout(function(){finish();diagRecord(method+': no callback after 8 seconds');},8000);
 try{api[method]({onsuccess:function(channel){if(done)return;if(token!==tvToken){finish();return;}finish();diagRecord(method+' succeeded; hidden='+document.hidden+'; mode='+mode);tunerValue('Tune callback channel',channel);try{tunerValue('Tuned channel',api.getCurrentChannel());tunerValue('Programme after tuning',api.getCurrentProgram());}catch(e){tunerError('Tuned data read failed',e);}},onnosignal:function(){if(done)return;finish();diagRecord(method+': no signal');},onprograminforeceived:function(program){if(token===tvToken)tunerValue('Tune programme event',program);}},function(e){if(done)return;finish();tunerError(method+' failed',e);});}catch(e){finish();tunerError(method+' failed',e);}
}

function registerChannelKeys(){
 if(preview)return;
 ['ChannelUp','ChannelDown'].forEach(function(name){try{var key=tizen.tvinputdevice.getKey(name);tizen.tvinputdevice.registerKey(name);diagRecord(name+' registered ('+(key?key.code:'unknown')+')');}catch(e){diagRecord(name+' registration: '+(e.name||e.message));}});
}
function scanTunerCapabilities(){
 if(preview){diagRecord('Tuner API scan requires the room TV.');return;}
 diagRecord('Tuner API scan 0.4.1 — read only; no tuning calls');
 function inspect(label,obj){
  if(!obj){diagRecord(label+': unavailable');return;}
  try{var names=[],seen={};for(var depth=0;obj&&depth<3;depth++,obj=Object.getPrototypeOf(obj)){Object.getOwnPropertyNames(obj).forEach(function(name){if(name==='constructor'||seen[name])return;seen[name]=true;var d=Object.getOwnPropertyDescriptor(obj,name);if(d&&typeof d.value==='function')names.push(name);});}diagRecord(label+': methods '+(names.sort().join(', ')||'none enumerable'));}catch(e){diagRecord(label+': '+(e.name||e.message));}
 }
 inspect('tizen.tvchannel',tizen.tvchannel);
 function inspectLibrary(name){try{var lib=window[name];if(!lib){diagRecord(name+': unavailable');return;}var modules=Object.getOwnPropertyNames(lib);diagRecord(name+' modules: '+modules.join(', '));modules.filter(function(n){return /broadcast|channel|input|control|epg/i.test(n);}).forEach(function(n){try{inspect(name+'.'+n,lib[n]);}catch(e){diagRecord(name+'.'+n+': '+e.name);}});}catch(e){diagRecord(name+': '+(e.name||e.message));}}
 inspectLibrary('webapis');inspectLibrary('b2bapis');
}

function registerGuide(){
 if(preview)return;
 try{var key=tizen.tvinputdevice.getKey('Guide');if(key)guideCode=key.code;tizen.tvinputdevice.registerKey('Guide');diagRecord('Guide registered ('+guideCode+')');}catch(e){diagRecord('Guide registration failed: '+(e.name||e.message));}
}
function closeDiagnosticWidget(){
 if(preview){say('Close widget can only be tested on the room TV.');return;}
 try{tizen.application.getCurrentApplication().exit();}catch(e){diagRecord('Close widget failed: '+(e.name||e.message));say('Unable to close widget: '+(e.name||e.message));}
}
function renderDiagnostics(){
 heading('ROOM 3 TEST ONLY','TV diagnostics','Scan apps, then test a Guide or Channel List candidate. Home should return here. No apps are launched automatically.');
 panel.appendChild(action('Watch TV inside widget — Room 3 test',startEmbeddedTV));
 panel.appendChild(action('TV Guide',launchGuide));
 panel.appendChild(action('Scan tuner APIs',scanTunerCapabilities));
 panel.appendChild(action('Read channel and programme data',readTunerData));
 panel.appendChild(action('Clear diagnostic log',function(){diagLog=[];diagRecord('Log cleared');render();}));
 panel.appendChild(action('Close widget',closeDiagnosticWidget));
 panel.appendChild(node('p','Exit test: closes this application. Test GUIDE and CH LIST on live TV, then HOME. If HOME does not restore the welcome screen, restart the TV.'));
 panel.appendChild(action('Scan installed apps',scanDiagnosticApps));
 panel.appendChild(action(diagAll?'Show Guide / Channel List candidates':'Show all app IDs',function(){diagAll=!diagAll;diagPage=0;render();}));
 var keyNames=diagKeys.filter(function(k){return /guide|channel|home/i.test(k.name);}).map(function(k){return k.name+' ('+k.code+')';});
 panel.appendChild(node('p','Supported relevant keys: '+(keyNames.join(', ')||'none reported')+'. Test 0.4.1: GUIDE opens org.tizen.epg when its event reaches this widget. Channel Up/Down now test tuneUp/tuneDown inside embedded TV. Read channel and programme data, then test P up/down. Native GUIDE still hands over to Samsung TV.'));
 var apps=diagApps?(diagAll?diagApps:diagApps.filter(diagCandidate)):[];
 if(diagApps&&!apps.length)panel.appendChild(node('p','No matching Guide / Channel List apps were reported. Show all app IDs to inspect the inventory.'));
 var pages=Math.max(1,Math.ceil(apps.length/6));diagPage=Math.min(diagPage,pages-1);
 if(apps.length){panel.appendChild(node('p','Apps page '+(diagPage+1)+' of '+pages));panel.appendChild(action('Previous apps',function(){diagPage=(diagPage+pages-1)%pages;render();}));panel.appendChild(action('Next apps',function(){diagPage=(diagPage+1)%pages;render();}));}
 apps.slice(diagPage*6,diagPage*6+6).forEach(function(app){var card=node('div','','info-card');card.appendChild(node('strong',app.name));card.appendChild(node('p',app.id));if(diagCandidate(app))card.appendChild(action('Test opening '+app.name,function(){diagLaunch(app);}));panel.appendChild(card);});
 panel.appendChild(node('h2','Diagnostic log'));var log=node('pre',diagLog.join('\n'),'diag-log');log.id='diag-log';panel.appendChild(log);
}
function launchMovies(){if(preview){say('Airtime opens on the room TV. It is not available in the browser preview.');return;}try{tizen.application.getAppsInfo(function(apps){var id=null;for(var i=0;i<apps.length;i++)if(apps[i].name.toLowerCase()==='airtime'){id=apps[i].id;break;}if(!id){say('Airtime is not installed on this TV.');return;}tizen.application.launch(id,function(){},function(e){say('Unable to open Airtime: '+e.name);});},function(e){say('Unable to find Airtime: '+e.name);});}catch(e){say('Unable to open Airtime: '+e.message);}}
function stopLive(){
 if(mode!=='tv-loading'&&mode!=='tv-embedded')return;
 var embedded=mode==='tv-embedded';clearTimeout(channelTimer);channelTimer=null;channelBusy=false;tvToken++;clearTimeout(tvTimer);mode='menu';
 if(embedded){document.body.className='';document.documentElement.className='';document.getElementById('live-overlay').className='hidden';try{tizen.tvwindow.hide(function(){diagRecord('TVWindow hidden');},function(e){diagRecord('TVWindow hide: '+e.name);});}catch(e){diagRecord('TVWindow hide: '+(e.name||e.message));}}
}
function startEmbeddedTV(){
 if(preview){say('Embedded antenna TV can only be tested on the room television.');return;}
 if(mode!=='menu')return;
 if(!tizen.tvwindow){diagRecord('TVWindow unavailable');say('TVWindow is unavailable. Native Watch TV remains available.');return;}
 mode='tv-loading';var token=++tvToken;diagRecord('Starting embedded antenna TV');say('Opening antenna TV inside widget…');
 function failed(e){if(token!==tvToken)return;stopLive();embeddedGuideResume=false;diagRecord('Embedded TV failed: '+(e.name||e.message));say('Embedded TV failed: '+(e.name||e.message)+'. Use native Watch TV.');}
 function showTV(){if(token!==tvToken)return;try{tizen.tvwindow.show(function(rect){if(token!==tvToken){try{tizen.tvwindow.hide(function(){},function(){});}catch(ignore){}return;}clearTimeout(tvTimer);embeddedGuideResume=false;mode='tv-embedded';document.body.className='live';document.documentElement.className='live';document.getElementById('live-overlay').className='';document.getElementById('live-return').focus();diagRecord('Embedded TV visible; widget hidden='+document.hidden+'; rect='+rect.join(','));},failed,['0%','0%','100%','100%'],'MAIN','BEHIND');}catch(e){failed(e);}}
 tvTimer=setTimeout(function(){failed({name:'TVWindow timed out'});},12000);
 try{var current=tizen.tvwindow.getSource();diagRecord('Current TV source: '+current.type);if(current.type==='TV'){showTV();return;}}catch(e){diagRecord('Source discovery: '+(e.name||e.message));}
 try{tizen.systeminfo.getPropertyValue('VIDEOSOURCE',function(info){if(token!==tvToken)return;var sources=info.connected||[],source=null;for(var i=0;i<sources.length;i++)if(sources[i].type==='TV'){source=sources[i];break;}if(!source){failed({name:'No TV tuner source reported'});return;}try{tizen.tvwindow.setSource(source,showTV,failed,'MAIN');}catch(e){failed(e);}},failed);}catch(e){failed(e);}
}
function startLive(){
 if(preview){say('Watch TV opens Samsung’s native TV screen on the room TV.');return;}
 if(mode!=='menu')return;
 if(!tizen.application||!tizen.application.launch){say('Samsung TV could not open: application launch is unavailable.');return;}
 mode='tv-loading';var token=++tvToken;say('Opening Samsung TV…');
 function failed(e){if(token!==tvToken)return;stopLive();say('Samsung TV could not open: '+(e&&e.name||e&&e.message||'Unknown error')+'. The hotel menu remains available.');}
 tvTimer=setTimeout(function(){failed({name:'TV launch timed out'});},12000);
 try{tizen.application.launch('org.tizen.tv-viewer',function(){if(token!==tvToken)return;clearTimeout(tvTimer);mode='menu';view='welcome';focus(0);render();},failed);}catch(e){failed(e);}
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
function open(i){cancelEmbeddedResume();diagKeyMode(false);stopLive();if(mode==='video')stopVideo();focus(i);view=buttons[i].getAttribute('data-view');panel.scrollTop=0;if(view==='diagnostics')diagKeyMode(true);render();if(view==='movies')launchMovies();}
for(var i=0;i<buttons.length;i++)(function(index){buttons[index].onclick=function(){open(index);};})(i);
document.getElementById('live-return').onclick=function(){embeddedGuideResume=false;stopLive();open(0);};
document.getElementById('video-return').onclick=function(){stopVideo();open(navFor('videos'));};
document.addEventListener('focusin',function(e){document.getElementById('help').textContent=e.target.parentNode===nav?'▲ ▼ Menu · OK Open · ▶ Explore · Return Welcome':'▲ ▼ Scroll · ◀ ▶ Choose · OK Open · Return Welcome';});
function isBack(k){return k===10009||k===27||k===8;}
document.addEventListener('keydown',function(e){var k=e.keyCode;if(k===guideCode||e.key==='Guide'){diagRecord('GUIDE received; hidden='+document.hidden+'; view='+view+'; mode='+mode);e.preventDefault();if(!e.repeat)launchGuide();return;}if(view==='diagnostics'&&mode==='menu')diagRecord('Key '+k+(e.key?' · '+e.key:''));
 if(mode==='tv-embedded'){if(k===427||k===428){e.preventDefault();if(!e.repeat)changeEmbeddedChannel(k===427);return;}diagRecord('Embedded TV key '+k+(e.key?' · '+e.key:''));if(isBack(k)||k===13){embeddedGuideResume=false;stopLive();open(0);e.preventDefault();}return;}
 if(mode==='tv-loading'){if(isBack(k)){stopLive();open(0);e.preventDefault();}return;}
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
try{var savedLog=JSON.parse(sessionStorage.getItem('vl-epg-log'));if(Array.isArray(savedLog))diagLog=savedLog.slice(-100);}catch(ignore){}
registerGuide();registerChannelKeys();
function clock(){document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}clock();setInterval(clock,10000);
focus(0);render();poll();setInterval(poll,30000);
function cancelEmbeddedResume(){clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;embeddedGuideResume=false;}
function scheduleEmbeddedResume(){
 clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;
 if(!embeddedGuideResume||document.hidden)return;
 diagRecord('Waiting 1500 ms of visible widget before TV restore');
 embeddedResumeTimer=setTimeout(function(){embeddedResumeTimer=null;if(document.hidden||!embeddedGuideResume)return;diagRecord('Stable visibility: restoring embedded TV');mode='menu';startEmbeddedTV();},1500);
}
function onWidgetVisibility(){
 diagRecord('Visibility: '+(document.hidden?'hidden':'visible'));
 if(document.hidden){clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;if(embeddedGuideResume)diagRecord('TV restore pending: widget hidden again');diagKeyMode(false);stopLive();if(mode==='video')stopVideo();}
 else{if(embeddedGuideResume){scheduleEmbeddedResume();poll();return;}if(diagResume){diagResume=false;open(navFor('diagnostics'));diagRecord('Returned to diagnostic widget.');}else open(0);poll();}
}
document.addEventListener('visibilitychange',onWidgetVisibility);
window.addEventListener('pagehide',function(){clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;stopLive();if(mode==='video')stopVideo();});
})();
