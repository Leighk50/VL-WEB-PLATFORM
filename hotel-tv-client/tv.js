(function () {
'use strict';
var room=null,setupIndex=0,origin=VL_SERVER_ORIGIN.replace(/\/$/,''),preview=typeof tizen==='undefined';
if(preview){var match=location.search.match(/[?&]room=([1-6])(?:&|$)/);room=match?Number(match[1]):3;}else{try{var savedRoom=Number(localStorage.getItem('vl-assigned-room'));if(savedRoom>=1&&savedRoom<=6&&savedRoom%1===0)room=savedRoom;}catch(ignore){}}
var url=room?origin+'/api/tv/rooms/'+room+'/content':'',cacheKey=room?'vl-cloud-room-'+room:'',data=null,view='welcome',selected=0,menuIndex=0,busy=false,mode='menu',tvToken=0,tvTimer=null,welcomeGuidePending=false,noticeUntil=0,diagApps=null,diagPage=0,diagAll=false,diagLog=[],diagKeys=[],diagRegistered=[],diagResume=false,guideCode=458,embeddedGuideResume=false,embeddedResumeTimer=null;
var staffUnlocked=false,staffPinInput='',staffPinIndex=0,staffZeroCount=0,staffZeroTime=0,staffPinError='',staffFailures=0,staffBlockedUntil=0;
var staySection='',eventIndex=0,localSection='cinema',localIndex=0,cinemaDay=0,airtimeIndex=0,promoType="",promoTimer=null;
var nav=document.getElementById('nav'),buttons=nav.getElementsByTagName('button'),panel=document.getElementById('content'),status=document.getElementById('status'),clip=document.getElementById('clip');
function node(tag,value,cls){var el=document.createElement(tag);el.textContent=value||'';if(cls)el.className=cls;return el;}
function say(text){status.textContent=text;noticeUntil=Date.now()+15000;}
function message(title,text){panel.appendChild(node('h1',title));if(text)panel.appendChild(node('p',text,'lead'));}
function action(label,fn,cls){var el=node('button',label,cls||'action');el.setAttribute('data-action','yes');el.onclick=fn;return el;}
function focus(i){selected=(i+buttons.length)%buttons.length;var direction=i<0||i<selected?-1:1;for(var step=0;step<buttons.length&&buttons[selected].hidden;step++)selected=(selected+direction+buttons.length)%buttons.length;buttons[selected].focus();}
function navFor(name){for(var i=0;i<buttons.length;i++)if(buttons[i].getAttribute('data-view')===name)return i;return 0;}
function heading(label,title,text){panel.appendChild(node('div',label,'eyebrow'));message(title,text);}
function price(value){if(!value)return '';return /^\d+(\.\d+)?$/.test(value)?'£'+value:value;}
function tile(symbol,title,detail,name){var el=action('',function(){open(navFor(name));},'tile');var mark=node('span','','tile-symbol');var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('aria-hidden','true');var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',name==='live'?'M4 5h16v12H4z M8 21h8 M12 17v4':name==='movies'?'M8 5l12 7-12 7z':'M5 3v6 M8 3v6 M11 3v6 M5 9h6 M8 9v12 M18 3v18 M18 3c-4 3-4 8 0 8');svg.appendChild(path);mark.appendChild(svg);el.appendChild(mark);el.appendChild(node('strong',title));el.appendChild(node('small',detail));return el;}
var welcomeVideo=null,welcomeVideoIndex=0,welcomeVideoSources=[];
// Lindus welcome music: only while the welcome screen is visible.
var welcomeMusic=null;
function syncWelcomeMusic(){
 if(!welcomeMusic)return;
 if(view==='welcome'&&mode==='menu'&&!document.hidden&&room){
  welcomeMusic.volume=0.16;
  if(welcomeMusic.paused){try{var play=welcomeMusic.play();if(play&&play.catch)play.catch(function(){/* TV may require a remote keypress before audio playback */});}catch(ignore){}}
 }else welcomeMusic.pause();
}
function initWelcomeMusic(){
 welcomeMusic=document.createElement('audio');
 welcomeMusic.src='lindus-welcome-music.mp3';
 welcomeMusic.loop=true;welcomeMusic.preload='auto';welcomeMusic.volume=0.16;
 document.body.appendChild(welcomeMusic);
}
function stopWelcomeVideo(){if(welcomeVideo){welcomeVideo.pause();welcomeVideo.removeAttribute('src');welcomeVideo.load();welcomeVideo=null;}}
function renderWelcomeVideo(){
 var card=node('section','','welcome-media');var video=document.createElement('video');video.muted=true;video.autoplay=true;video.setAttribute('muted','');video.setAttribute('playsinline','');video.preload='metadata';card.appendChild(video);
 var caption=node('div','','media-caption');caption.appendChild(node('span','THE VILLAGE LIMITS','eyebrow'));caption.appendChild(node('h2','Good food. Great company.'));var state=node('p','Discover more during your stay.');caption.appendChild(state);card.appendChild(caption);panel.appendChild(card);
 welcomeVideo=video;welcomeVideoSources=(data&&data.welcomeVideo?[data.welcomeVideo]:[]).filter(function(v){return v&&/^https:\/\//i.test(v.url);});
 function next(){if(welcomeVideo!==video||mode!=='menu'||view!=='welcome'||document.hidden)return;var item=welcomeVideoSources[welcomeVideoIndex%welcomeVideoSources.length];video.src=item.url;video.muted=true;var result=video.play();if(result&&result.catch)result.catch(function(){state.textContent='Video is temporarily unavailable.';});}
 video.onended=function(){welcomeVideoIndex++;next();};video.onerror=function(){state.textContent='Video is temporarily unavailable.';};
 if(welcomeVideoSources.length){state.textContent='A taste of life at The Village Limits';next();}else state.textContent='Our hotel video will appear here when added.';
}
function renderAirtimeSelection(target){
 var catalogue=data&&data.airtime;if(!catalogue||!catalogue.updatedAt||Date.now()-Date.parse(catalogue.updatedAt)>=21600000||!catalogue.posters||!catalogue.posters.length)return;
 var section=node('section','','welcome-films');section.appendChild(node('h2','Free movies during your stay'));var row=node('div','','film-posters'),posters=catalogue.posters;
 for(var i=0;i<Math.min(3,posters.length);i++){var item=posters[(airtimeIndex+i)%posters.length];if(!/^https:\/\/airtime\.cloud\/cache\/img\//.test(item.image))continue;var button=action('',launchMovies,'film-poster');button.setAttribute('aria-label','Open Airtime to browse this featured film');var img=document.createElement('img');img.src=item.image;img.alt=item.alt||'Airtime film poster';img.onerror=function(){this.style.display='none';};button.appendChild(img);button.appendChild(node('span','OK · Open Airtime'));row.appendChild(button);}
 section.appendChild(row);if(posters.length>3)section.appendChild(action('More films ▶',function(){airtimeIndex=(airtimeIndex+3)%posters.length;renderWelcomePromo(true);},'film-more'));section.appendChild(node('p','Complimentary for our guests · Open Airtime to choose your film.','film-note'));target.appendChild(section);
}
function welcomePromoTypes(){var types=[];if(!data)return types;var a=data.airtime;if(a&&a.updatedAt&&Date.now()-Date.parse(a.updatedAt)<21600000&&a.posters&&a.posters.some(function(p){return /^https:\/\/airtime\.cloud\/cache\/img\//.test(p.image);}))types.push('movies');if(data.events&&data.events.length)types.push('events');if(data.explore&&data.explore.attractions&&data.explore.attractions.length)types.push('local');return types;}
function nextPromoType(types,current){var options=types.filter(function(t){return t!==current;});if(!options.length)options=types;return options.length?options[Math.floor(Math.random()*options.length)]:'';}
function rotateWelcomePromo(){var host=document.getElementById('welcome-promo');if(view!=='welcome'||mode!=='menu'||document.hidden||!host||host.contains(document.activeElement))return;promoType=nextPromoType(welcomePromoTypes(),promoType);airtimeIndex+=3;renderWelcomePromo(false);}
function renderWelcomePromo(keepFocus){
 var host=document.getElementById('welcome-promo');if(!host)return;var old=host.querySelectorAll('[data-action]'),focused=-1;if(keepFocus)for(var i=0;i<old.length;i++)if(old[i]===document.activeElement)focused=i;
 while(host.firstChild)host.removeChild(host.firstChild);var types=welcomePromoTypes();if(types.indexOf(promoType)<0)promoType=nextPromoType(types,'');if(!promoType)return;
 if(promoType==='movies')renderAirtimeSelection(host);
 else{
  var section=node('section','','welcome-films'),events=promoType==='events',items=events?data.events:data.explore.attractions,visual=items.filter(function(item){return !!item.image;}),pool=visual.length?visual:items,item=pool[Math.floor(Math.random()*pool.length)];
  section.appendChild(node('h2',events?'What’s On at The Village Limits':'Explore Woodhall Spa'));
  var button=action('',function(){if(events){eventIndex=items.indexOf(item);open(navFor('events'));}else{localSection=item.category;localIndex=data.explore.attractions.filter(function(p){return p.category===item.category;}).indexOf(item);open(navFor('local'));}},'welcome-spotlight');
  if(item.image){var source=events&&/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(item.image)?origin+item.image:!events&&/^https:\/\//.test(item.image)?item.image:'';if(source){var img=document.createElement('img');img.src=source;img.alt=item.title;img.className=events?'spotlight-poster':'spotlight-photo';img.onerror=function(){this.style.display='none';};button.appendChild(img);}}
  var copy=node('span','','spotlight-copy');copy.appendChild(node('strong',item.title));copy.appendChild(node('small',events?(item.date||item.startDate||''):(item.area||'')));copy.appendChild(node('span',(item.description||'').slice(0,150)));copy.appendChild(node('b',events?'OK · View event':'OK · Explore'));button.appendChild(copy);section.appendChild(button);host.appendChild(section);
 }
 host.appendChild(action('Discover more ▶',function(){promoType=nextPromoType(welcomePromoTypes(),promoType);renderWelcomePromo(true);},'film-more'));
 if(focused>=0){var actions=host.querySelectorAll('[data-action]');if(actions.length)actions[Math.min(focused,actions.length-1)].focus();}
}
function openStaffPIN(){staffUnlocked=false;staffPinInput='';staffPinIndex=0;staffPinError='';view='staff-pin';panel.scrollTop=0;render();}
function checkStaffPIN(){
 if(Date.now()<staffBlockedUntil){staffPinError='Please wait before trying again.';staffPinInput='';render();return;}
 if(staffPinInput==='5758'){staffUnlocked=true;staffFailures=0;staffPinInput='';open(navFor('diagnostics'));return;}
 staffFailures++;staffPinInput='';staffPinError='Incorrect PIN. Please try again.';if(staffFailures>=5){staffBlockedUntil=Date.now()+30000;staffFailures=0;staffPinError='Please wait 30 seconds before trying again.';}render();
}
function enterStaffDigit(digit){if(Date.now()<staffBlockedUntil){staffPinError='Please wait before trying again.';render();return;}staffPinInput+=digit;if(staffPinInput.length===4)checkStaffPIN();else render();}
function renderStaffPIN(){
 heading('STAFF ACCESS','Enter staff PIN','Use the number buttons, or choose digits with the arrows and OK. Return cancels.');panel.appendChild(node('p',new Array(staffPinInput.length+1).join('●')+new Array(5-staffPinInput.length).join('○'),'staff-pin-mask'));if(staffPinError)panel.appendChild(node('p',staffPinError));
 var pad=node('div','','staff-pin-pad');['1','2','3','4','5','6','7','8','9','Delete','0','Cancel'].forEach(function(label){pad.appendChild(action(label,function(){if(label==='Cancel')open(0);else if(label==='Delete'){staffPinInput=staffPinInput.slice(0,-1);render();}else enterStaffDigit(label);}));});panel.appendChild(pad);var choices=pad.querySelectorAll('[data-action]');if(choices[staffPinIndex])choices[staffPinIndex].focus();
}
function staffShortcut(k,repeat){if(view!=='welcome'||mode!=='menu')return false;if(k!==48){staffZeroCount=0;return false;}if(repeat)return true;var now=Date.now();staffZeroCount=now-staffZeroTime<3000?staffZeroCount+1:1;staffZeroTime=now;if(staffZeroCount>=4){staffZeroCount=0;openStaffPIN();}return true;}
function staffPinKey(k){
 if(view!=='staff-pin')return false;
 if(isBack(k)){open(0);return true;}if(k>=48&&k<=57){enterStaffDigit(String(k-48));return true;}
 if(k===37||k===39)staffPinIndex=(staffPinIndex+(k===37?-1:1)+12)%12;else if(k===38||k===40)staffPinIndex=(staffPinIndex+(k===38?-3:3)+12)%12;else if(k===13){var choice=panel.querySelectorAll('.staff-pin-pad [data-action]')[staffPinIndex];if(choice)choice.click();return true;}else return true;
 var choices=panel.querySelectorAll('.staff-pin-pad [data-action]');if(choices[staffPinIndex])choices[staffPinIndex].focus();return true;
}
var guestWelcome=null,guestToken='',guestPairCode='',guestRegisteredRoom=0,guestWelcomeBusy=false,guestRegisterAt=0;
function guestDeviceToken(){try{var stored=localStorage.getItem('vl-private-tv-token');if(/^[a-f0-9]{64}$/.test(stored||''))return stored;var bytes=new Uint8Array(32);if(!window.crypto||!window.crypto.getRandomValues)return '';window.crypto.getRandomValues(bytes);var token='';for(var i=0;i<bytes.length;i++)token+=('0'+bytes[i].toString(16)).slice(-2);localStorage.setItem('vl-private-tv-token',token);return localStorage.getItem('vl-private-tv-token')===token?token:'';}catch(e){return '';}}
function applyGuestWelcome(value){if(value&&(!value.name||typeof value.name!=='string'||value.name.length>181||!value.expiresAt||!isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()))value=null;var changed=JSON.stringify(guestWelcome)!==JSON.stringify(value);guestWelcome=value;if(changed&&mode==='menu'&&view==='welcome')render();}
function readGuestWelcome(requestRoom){var xhr=new XMLHttpRequest();xhr.open('GET',origin+'/api/tv/rooms/'+requestRoom+'/welcome',true);xhr.timeout=10000;xhr.setRequestHeader('X-TV-Token',guestToken);function finish(value){guestWelcomeBusy=false;if(requestRoom===room)applyGuestWelcome(value);}xhr.onerror=xhr.ontimeout=function(){finish(null);};xhr.onload=function(){try{var reply=xhr.status===200?JSON.parse(xhr.responseText):{};if(requestRoom===room)applyRemoteVolumeTest(reply.volumeTest);finish(reply.welcome||null);}catch(e){finish(null);}};try{xhr.send();}catch(e){finish(null);}}
function pollGuestWelcome(){if(preview||!room||guestWelcomeBusy)return;if(!guestToken)guestToken=guestDeviceToken();if(!guestToken)return;guestWelcomeBusy=true;var requestRoom=room;if(guestRegisteredRoom===room&&Date.now()-guestRegisterAt<300000){readGuestWelcome(requestRoom);return;}guestRegisterAt=Date.now();var xhr=new XMLHttpRequest();xhr.open('POST',origin+'/api/tv/device-register',true);xhr.timeout=10000;xhr.setRequestHeader('Content-Type','application/json');xhr.onerror=xhr.ontimeout=function(){guestWelcomeBusy=false;applyGuestWelcome(null);};xhr.onload=function(){if(requestRoom!==room){guestWelcomeBusy=false;return;}try{if(xhr.status!==200)throw Error();var result=JSON.parse(xhr.responseText);guestPairCode=result.code||'';guestRegisteredRoom=requestRoom;readGuestWelcome(requestRoom);}catch(e){guestWelcomeBusy=false;applyGuestWelcome(null);}};try{xhr.send(JSON.stringify({token:guestToken,room:requestRoom}));}catch(e){guestWelcomeBusy=false;}}

function applyRemoteVolumeTest(command){
 if(preview||room!==1||document.hidden||!command||command.room!==1||command.volume!==22||typeof command.id!=='string'||!isFinite(Date.parse(command.expiresAt))||Date.parse(command.expiresAt)<=Date.now())return;
 var result=null;try{result=JSON.parse(localStorage.getItem('vl-volume-test-result')||'null');}catch(e){}
 if(!result||result.id!==command.id){
  result={id:command.id,before:null,after:null,error:'',methods:[]};
  [['tizen.tvaudiocontrol',window.tizen&&tizen.tvaudiocontrol],['b2bapis.b2bcontrol',window.b2bapis&&b2bapis.b2bcontrol]].forEach(function(pair){try{var obj=pair[1],seen={};for(var depth=0;obj&&depth<3;depth++,obj=Object.getPrototypeOf(obj))Object.getOwnPropertyNames(obj).forEach(function(n){if(!seen[n]&&/volume/i.test(n)){seen[n]=true;result.methods.push(pair[0]+'.'+n);}});}catch(e){}});
  try{if(!window.tizen||!tizen.tvaudiocontrol)throw Error('TV audio API unavailable');result.before=tizen.tvaudiocontrol.getVolume();tizen.tvaudiocontrol.setVolume(22);result.after=tizen.tvaudiocontrol.getVolume();}catch(e){result.error=(e.name||'Error')+': '+(e.message||'Volume command failed');}
  try{localStorage.setItem('vl-volume-test-result',JSON.stringify(result));}catch(e){}
  diagRecord('Central volume test: before='+result.before+'; after='+result.after+'; '+(result.error||'request completed'));
 }
 var report=new XMLHttpRequest();report.open('POST',origin+'/api/tv/rooms/1/volume-result',true);report.timeout=10000;report.setRequestHeader('Content-Type','application/json');report.setRequestHeader('X-TV-Token',guestToken);try{report.send(JSON.stringify(result));}catch(e){}
}

function departureMessage(value){return value&&Date.parse(value.expiresAt)>Date.now()&&value.isCheckoutDay===true&&typeof value.checkoutMessage==='string'&&value.checkoutMessage.length<=500?value.checkoutMessage:'';}
function renderRoomSetup(){
 view='setup';document.getElementById('room').textContent='TV SETUP';heading('ONE APP, EVERY ROOM','Assign this television','Select the room this TV is installed in. This is saved on the TV and does not change Airtime verification.');
 var choices=node('div','','room-choices');for(var i=1;i<=6;i++)(function(id){choices.appendChild(action('Room '+id,function(){assignRoom(id);}));})(i);panel.appendChild(choices);status.textContent='Staff setup · Select a room and press OK';var list=choices.querySelectorAll('[data-action]');if(list[setupIndex])list[setupIndex].focus();
}
function assignRoom(id){
 try{localStorage.setItem('vl-assigned-room',String(id));if(localStorage.getItem('vl-assigned-room')!==String(id))throw Error('Room could not be saved');}catch(e){say('Room assignment could not be saved. Please contact the team.');return;}
 guestWelcome=null;guestRegisteredRoom=0;guestRegisterAt=0;room=id;url=origin+'/api/tv/rooms/'+room+'/content';cacheKey='vl-cloud-room-'+room;data=null;view='welcome';panel.className='';document.getElementById('room').textContent='ROOM '+room;try{var stored=JSON.parse(localStorage.getItem(cacheKey));if(valid(stored))data=stored;}catch(ignore){}focus(0);render();poll();
}
function changeRoomAssignment(){stopLive();if(mode==='video')stopVideo();try{localStorage.removeItem('vl-assigned-room');}catch(ignore){}room=null;data=null;url='';cacheKey='';setupIndex=0;render();}
function render(){
 stopWelcomeVideo();
 setTimeout(syncWelcomeMusic,0);
 var scroll=panel.scrollTop,active=document.activeElement,actionIndex=-1,oldActions=panel.querySelectorAll('[data-action]');
 for(var a=0;a<oldActions.length;a++)if(oldActions[a]===active)actionIndex=a;
 while(panel.firstChild)panel.removeChild(panel.firstChild);
 if(!room){panel.className='';renderRoomSetup();return;}
 for(var b=0;b<buttons.length;b++){var isActive=buttons[b].getAttribute('data-view')===view;buttons[b].className=isActive?'active':'';buttons[b].setAttribute('aria-current',isActive?'page':'false');}
 if(data)document.getElementById('room').textContent=data.room.label.toUpperCase();
 panel.className=view==='welcome'?'welcome-layout':'';
 if(view==='staff-pin'){renderStaffPIN();
 }else if(view==='welcome'){
  heading('YOUR STAY, YOUR WAY',guestWelcome&&Date.parse(guestWelcome.expiresAt)>Date.now()?'Welcome, '+guestWelcome.name:(data?data.pages[0].title:'Make yourself at home'),'A little comfort. A good meal. Something to look forward to.');
  var departure=departureMessage(guestWelcome);var copy=node('div','','welcome-copy'+(departure?' checkout-reminder':''));if(departure){copy.appendChild(node('strong','Before you leave'));copy.appendChild(node('p',departure));}else copy.appendChild(node('p',data?data.pages[0].text:'Hotel information is temporarily unavailable. Please speak to our team.'));panel.appendChild(copy);
  var welcomeText=node('div','','welcome-text');while(panel.firstChild)welcomeText.appendChild(panel.firstChild);panel.appendChild(welcomeText);var promo=node('div','','welcome-promo');promo.id='welcome-promo';welcomeText.appendChild(promo);renderWelcomePromo(false);renderWelcomeVideo();
 }else if(view==='live'){
  heading('ROOM ENTERTAINMENT','Watch TV',preview?'Live TV is available on the room television.':'Open Samsung TV for channels and the programme guide. Use GUIDE for channel selection and Return for the hotel menu.');
  panel.appendChild(action('Watch TV',startEmbeddedTV));
  panel.appendChild(action('Watch TV — native screen',startLive));
  panel.appendChild(action('TV Guide',launchGuide));
 }else if(view==='movies'){
  heading('A NIGHT IN','Movies / Airtime','Enjoy complimentary movies during your stay. Choose your film in Airtime.');
  panel.appendChild(action('Open Airtime',launchMovies));
 }else if(view==='videos'){
  heading('DISCOVER THE VILLAGE LIMITS','Video clips','A closer look at what’s happening here.');
  var videos=data&&data.videos||[];
  if(!videos.length)panel.appendChild(node('p','New clips will appear here when they are added.'));
  videos.forEach(function(video){panel.appendChild(action('▶ '+video.title,function(){playVideo(video);}));});
 }else if(view==='diagnostics'){if(staffUnlocked)renderDiagnostics();else{view='staff-pin';renderStaffPIN();}
 }else if(view==='info'){renderStay();
 }else if(!data){message('Connecting to hotel information','Please try again shortly. Watch TV and Airtime remain available from the menu.');
 }else if(view==='dining'){
  heading('AT OUR TABLE','Our Restaurant Menu','Wednesday–Saturday from 6pm · Sunday from 12pm');
  if(!data.menus.length){panel.appendChild(node('p','Please ask our team about current menus.'));}
  else{
   if(menuIndex>=data.menus.length)menuIndex=0;
   var tabs=node('div','','tabs');data.menus.forEach(function(menu,index){var tab=action(menu.name,function(){menuIndex=index;panel.scrollTop=0;render();panel.querySelectorAll('[data-action]')[index].focus();});if(index===menuIndex)tab.className='chosen';tabs.appendChild(tab);});panel.appendChild(tabs);
   var menu=data.menus[menuIndex];if(menu.description)panel.appendChild(node('p',menu.description));
   menu.sections.forEach(function(section){panel.appendChild(node('h2',section.name,'section-name'));section.items.forEach(function(item){var row=node('div','','item');row.appendChild(node('span',price(item.price),'price'));row.appendChild(node('strong',item.name));if(item.description)row.appendChild(node('p',item.description));if(item.allergens)row.appendChild(node('p','Allergens: '+item.allergens,'allergens'));panel.appendChild(row);});});
  }
 }else if(view==='local'){
  renderExplore();
 }else if(view==='events'){renderEventPoster();
 }

 panel.scrollTop=scroll;
 var newActions=panel.querySelectorAll('[data-action]');if(actionIndex>=0&&newActions[actionIndex])newActions[actionIndex].focus();
}
function renderExplore(){
 heading('EXPLORE YOUR SURROUNDINGS','Explore Woodhall Spa','Local favourites, aviation heritage and days out.');
 var tabs=node('div','','tabs explore-tabs'),sections=[['cinema','Kinema'],['village','Woodhall Spa'],['aviation','Aviation & Museums'],['days','Nearby Days Out']];
 sections.forEach(function(item){var button=action(item[1],function(){localSection=item[0];localIndex=0;panel.scrollTop=0;render();var chosen=panel.querySelector('.explore-tabs .chosen');if(chosen)chosen.focus();});if(localSection===item[0])button.className+=' chosen';tabs.appendChild(button);if(item[0]==='cinema'&&localSection==='cinema'){tabs.appendChild(action(cinemaDay?'Today':'Tomorrow',function(){cinemaDay=cinemaDay?0:1;panel.scrollTop=0;render();var toggle=panel.querySelector('.kinema-day-toggle');if(toggle)toggle.focus();},'action kinema-day-toggle'));}});panel.appendChild(tabs);
 var info=data.explore;if(!info){panel.appendChild(node('p','Visitor information is loading. Please try again shortly.'));return;}
 var kinema=info.attractions.filter(function(p){return p.id==='kinema';})[0];
 if(localSection==='cinema'){
  var cinema=info.cinema,days=cinema.days||[];
  var day=days[cinemaDay];panel.appendChild(node('h2',(cinemaDay?'Tomorrow':'Today')+' at the Kinema'));if(day)panel.appendChild(node('p',day.date,'date'));
  var layout=node('div','','explore-layout'),list=node('div','','cinema-list');if(kinema){var kinemaPhoto=explorePhoto(kinema);if(kinemaPhoto)list.appendChild(kinemaPhoto);}
  if(cinema.status!=='available'||!cinema.updatedAt||Date.now()-Date.parse(cinema.updatedAt)>=3600000)list.appendChild(node('p','Screening times are temporarily unavailable. Scan the QR code for the latest listings and tickets.'));
  else if(!day||!day.films.length)list.appendChild(node('p','No screenings are currently listed for this day. Check the Kinema website for updates.'));
  else day.films.forEach(function(film){var card=node('article','','cinema-film');card.appendChild(node('h3',film.title));card.appendChild(node('p',film.times.join(' · '),'showtimes'));list.appendChild(card);});
  layout.appendChild(list);if(kinema)layout.appendChild(exploreQR(kinema,'Scan for listings & tickets'));panel.appendChild(layout);
  if(cinema.updatedAt)panel.appendChild(node('p','Listings checked '+new Date(cinema.updatedAt).toLocaleString('en-GB')+' · Times may change; confirm when booking.','allergens'));
 }else{
  var places=info.attractions.filter(function(p){return p.category===localSection;});if(!places.length)return;localIndex=Math.max(0,Math.min(localIndex,places.length-1));
  var controls=node('div','','event-controls');controls.appendChild(action('◀ Previous',function(){localIndex=(localIndex+places.length-1)%places.length;panel.scrollTop=0;render();}));controls.appendChild(node('span',(localIndex+1)+' of '+places.length));controls.appendChild(action('Next ▶',function(){localIndex=(localIndex+1)%places.length;panel.scrollTop=0;render();}));panel.appendChild(controls);
  var place=places[localIndex],layout=node('div','','explore-layout'),copy=node('article','','explore-copy');var photo=explorePhoto(place);if(photo)copy.appendChild(photo);copy.appendChild(node('div',place.area,'eyebrow'));copy.appendChild(node('h2',place.title));copy.appendChild(node('p',place.description,'lead'));copy.appendChild(node('p','Check the official website for opening dates, admission and booking before setting off.'));layout.appendChild(copy);layout.appendChild(exploreQR(place,'Scan to plan your visit'));panel.appendChild(layout);
 }
}
function explorePhoto(place){if(!place.image||!/^https:\/\//i.test(place.image))return null;var figure=node('figure','','explore-photo'),img=document.createElement('img');img.src=place.image;img.alt=place.imageAlt||place.title;if(place.imageFit==='contain')img.className='photo-contain';img.onerror=function(){figure.style.display='none';};figure.appendChild(img);figure.appendChild(node('figcaption',place.imageCredit||place.title));return figure;}
function exploreQR(place,label){var card=node('aside','','explore-qr');if(place.qr&&/^data:image\/png;base64,/.test(place.qr)){var img=document.createElement('img');img.src=place.qr;img.alt='QR code for '+place.title;card.appendChild(img);}card.appendChild(node('strong',label));card.appendChild(node('p',place.url.replace(/^https:\/\//,'')));return card;}
function focusStayTab(){var tabs=panel.querySelector('.stay-buttons');if(!tabs)return;var chosen=tabs.querySelector('.chosen')||tabs.querySelector('[data-action]');if(chosen)chosen.focus();}
function moveStayFocus(k,active){
 if(view!=='info'||(k!==38&&k!==40))return false;
 var tabs=panel.querySelector('.stay-buttons');if(!tabs)return false;
 if(active&&active.parentNode===tabs&&k===40){var all=panel.querySelectorAll('[data-action]');for(var i=0;i<all.length;i++)if(all[i].parentNode!==tabs){all[i].focus();return true;}return false;}
 if(active&&active.getAttribute&&active.getAttribute('data-action')==='yes'&&active.parentNode!==tabs&&k===38){focusStayTab();return true;}
 return false;
}
function guestCard(title,text){var card=node('article','','info-card');card.appendChild(node('h2',title));card.appendChild(node('p',text));panel.appendChild(card);}
function renderStay(){
 heading('YOUR ROOM, YOUR COMFORT','Your Stay','Useful information for a comfortable visit.');
 var sections=[['breakfast','Breakfast'],['checkout','Checkout'],['heating','Heating & Air Conditioning'],['restaurant','Bar & Restaurant'],['emergency','Emergency Information']];
 var tabs=node('div','','stay-buttons');sections.forEach(function(item){var button=action(item[1],function(){staySection=item[0];panel.scrollTop=0;render();focusStayTab();});if(staySection===item[0])button.className+=' chosen';tabs.appendChild(button);});panel.appendChild(tabs);
 if(!staySection){panel.appendChild(node('p','Choose a section using the arrows and press OK.'));return;}
 if(staySection==='breakfast'){
  guestCard('Breakfast · 8am–10am','Please help yourself to juices, yoghurt and cereals. Enjoy a freshly cooked breakfast to start your day.');
  var dishes=[['Village Limits English Breakfast','Two grilled bacon, one Boston sausage, grilled tomato, mushroom, black pudding, hash brown, baked beans, toast and a choice of fried, scrambled or poached egg.','D, E, G, S, Sd'],['Vegan Breakfast','Two Moving Mountains sausages, grilled tomato, mushroom, baked beans, hash brown and toast.','G, S'],['Eggs Benedict','Two poached eggs, Parma ham, hollandaise and a toasted muffin. Florentine option: replace Parma ham with spinach and flat cap mushroom.','G, D, E, S, Sd'],['Poached or Scrambled Eggs','Served on brown or white toast.','D, E, G'],['Baked Beans and Bacon on Toast','Baked beans and chopped bacon on brown or white toast.','D, G, S, Sd'],['Sausage or Bacon Roll','Grilled bacon or sausage on a soft white roll. Vegan option available. Add an egg if you wish.','D, G, E, S, Sd'],['Pancake Stack','Three American-style pancakes, summer berry compote and Greek yoghurt, maple syrup and bacon OR chocolate chip sauce.','G, D, E, S'],['Three Egg Omelette','Choose three fillings: bacon, cheddar cheese, mushroom, tomato or spinach.','D, E']];
  dishes.forEach(function(dish){var row=node('div','','item');row.appendChild(node('strong',dish[0]));row.appendChild(node('p',dish[1]));row.appendChild(node('p','Allergens: '+dish[2],'allergens'));panel.appendChild(row);});
  guestCard('Hot Drinks','Pot of tea · Americano · Latte · Cappuccino · Hot chocolate');
  guestCard('Allergies & Intolerances','Please advise a member of our team if anyone in your party has a food allergy or intolerance. We cannot guarantee that items are completely allergen-free, as our kitchen contains ingredients with allergens.\n\nC: Crustaceans · Ce: Celery · D: Dairy · E: Eggs · F: Fish · P: Peanuts · G: Gluten · L: Lupin · N: Nuts · M: Molluscs · Mu: Mustard · S: Soya · Sd: Sulphur dioxide · Se: Sesame seeds');
 }else if(staySection==='checkout')guestCard('Checkout','Monday–Friday: by 10am\nSaturday & Sunday: by 11am\n\nWhen you are ready to check out, please leave your keys in your room and close the door behind you.\n\nThank you for staying at The Village Limits. We hope to welcome you back soon.');
 else if(staySection==='heating'){
  guestCard('Radiator Heating','Each radiator has a thermostatic valve. Turn it towards a higher number for more warmth or a lower number for less warmth. The radiator may cool down once the room reaches the selected temperature.');
  guestCard('Fujitsu Air Conditioning','1. Press the power button at the bottom right of the wall controller to turn it on or off.\n2. Use ◀ ▶ to highlight Mode, then ▲ ▼ to select Cool or Heat, where available.\n3. Use ◀ ▶ to highlight Set temp., then ▲ ▼ to adjust the temperature.\n4. Highlight Fan to adjust the fan speed. Auto is a simple choice.\n\nKeep windows and doors closed while it is running. Please speak to our team if you need help.');
 }else if(staySection==='restaurant'){
  guestCard('Restaurant Opening Times','Wednesday–Saturday: from 6pm\nSunday: from 12pm');
  panel.appendChild(action('View Our Restaurant Menus',function(){open(navFor('dining'));panel.focus();}));
 }else if(staySection==='emergency')guestCard('Emergency Information','In an emergency, please call\n01526 353312\nand select Option 0.');
}
function renderEventPoster(){
 heading('GOOD TIMES AHEAD',"What's On",'Discover our upcoming events.');var events=data&&data.events||[];
 if(!events.length){panel.appendChild(node('p','Please ask our team about forthcoming events.'));return;}
 eventIndex=Math.max(0,Math.min(eventIndex,events.length-1));var event=events[eventIndex];
 var controls=node('div','','event-controls');controls.appendChild(action('◀ Previous',function(){eventIndex=(eventIndex+events.length-1)%events.length;render();}));controls.appendChild(node('span',(eventIndex+1)+' of '+events.length));controls.appendChild(action('Next ▶',function(){eventIndex=(eventIndex+1)%events.length;render();}));panel.appendChild(controls);
 var layout=node('div','','poster-layout');if(event.image&&/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(event.image)){var img=document.createElement('img');img.src=origin+event.image;img.alt=event.title+' poster';img.className='event-poster';img.onerror=function(){this.style.display='none';};layout.appendChild(img);}
 var details=node('article','','poster-details');details.appendChild(node('h2',event.title));details.appendChild(node('div',event.date||event.startDate,'date'));details.appendChild(node('p',event.description));if(event.soldOut||event.price)details.appendChild(node('span',event.soldOut?'Currently sold out':price(event.price),'badge'));layout.appendChild(details);panel.appendChild(layout);
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
function tunerError(label,e){diagRecord(label+': '+(e&&e.name||'UnknownError')+(e&&e.message?' — '+String(e.message).slice(0,300):''));}
function tunerValue(label,value){var text;try{text=JSON.stringify(value);}catch(e){text=String(value);}diagRecord(label+': '+(text===undefined?'no synchronous result':text.slice(0,1800)));}
function readTunerData(){
 if(preview||!tizen.tvchannel){diagRecord('TV channel API unavailable');return;}
 var api=tizen.tvchannel;diagRecord('Reading tuner data 1.0.0');
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


var channelGuideOpen=false,guideChannels=[],guideIndex=0,guideGeneration=0,guideTimer=null;

var programmeCache={},scheduleSequence=0,scheduleTimer=null,scheduleShape=-1;
function programmeTime(value){try{if(value&&typeof value.getHours==='function')return ('0'+value.getHours()).slice(-2)+':'+('0'+value.getMinutes()).slice(-2);if(value&&typeof value.getTime==='function'){var d=new Date(value.getTime());if(isFinite(d.getTime()))return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}}catch(ignore){}return '';}
function programmeRange(program){var start=programmeTime(program.startTime),end='';try{if(start&&program.startTime&&typeof program.startTime.addDuration==='function'&&tizen.TimeDuration)end=programmeTime(program.startTime.addDuration(new tizen.TimeDuration(program.duration,'SECS')));}catch(ignore){}return start+(end?' – '+end:'');}
function renderProgrammeDetails(){
 var box=document.getElementById('programme-details');box.textContent='';var c=guideChannels[guideIndex];if(!c)return;
 box.appendChild(node('h2',c.channelName||c.serviceName||'Channel'));
 var cached=programmeCache[String(c._serviceId)],current=null;
 try{var tuned=tizen.tvchannel.getCurrentChannel();if(tuned._serviceId===c._serviceId)current=tizen.tvchannel.getCurrentProgram();}catch(ignore){}
 var items=cached&&cached.items&&cached.items.length?cached.items:(current?[current]:[]);
 if(!items.length){box.appendChild(node('p',cached&&cached.message||'Programme listings not yet available for this channel.'));return;}
 items.slice(0,12).forEach(function(program){var card=node('div');card.className='programme-card';card.appendChild(node('small',programmeRange(program)||'Time unavailable'));card.appendChild(node('h3',program.title||'Programme information'));if(program.detailedDescription)card.appendChild(node('p',program.detailedDescription));box.appendChild(card);});
}
function readSelectedSchedule(force){
 if(preview||!guideChannels[guideIndex])return;
 var channel=guideChannels[guideIndex],id=String(channel._serviceId),api=tizen.tvchannel;
 renderProgrammeDetails();if(!force&&programmeCache[id])return;
 if(!api||typeof api.getProgramList!=='function'){programmeCache[id]={message:'Schedule API unavailable'};return;}
 var seq=++scheduleSequence;clearTimeout(scheduleTimer);var done=false,attempt=scheduleShape>=0?scheduleShape:0;
 function active(){return seq===scheduleSequence&&!done;}
 function fail(e){if(!active())return;done=true;clearTimeout(scheduleTimer);programmeCache[id]={message:'Upcoming listings unavailable. Current programme is shown when tuned.'};tunerError('Schedule read failed',e);if(channelGuideOpen)renderProgrammeDetails();}
 function success(items){if(!active())return;done=true;clearTimeout(scheduleTimer);if(!Array.isArray(items)){programmeCache[id]={message:'Unexpected schedule response'};tunerValue('Schedule response',items);return;}scheduleShape=attempt;programmeCache[id]={items:items};diagRecord('Schedule received '+items.length+' programmes for '+channel.channelName+'; shape='+attempt);items.slice(0,3).forEach(function(pr){tunerValue('Schedule programme',pr);diagRecord('Programme time: '+programmeRange(pr)+'; start type='+Object.prototype.toString.call(pr.startTime));});if(channelGuideOpen)renderProgrammeDetails();}
 // Read-only pilot: old hospitality API documentation is unavailable.
 // TV 4.0 validation confirms ChannelInfo, time, then callback positions.
 // Omit unverified optional range arguments in this pilot.
 function call(){
  var now;try{now=tizen.time.getCurrentDateTime();}catch(ignore){now=new Date();}
  var args=[[channel,now,success,fail]];
  diagRecord('Read schedule for '+channel.channelName+'; argument layout '+attempt);
  scheduleTimer=setTimeout(function(){fail({name:'TimeoutError',message:'No schedule callback after 8 seconds'});},8000);
  try{api.getProgramList.apply(api,args[attempt]);}catch(e){clearTimeout(scheduleTimer);tunerError('Schedule layout '+attempt,e);fail(e);}
 }
 call();
}
function probeCurrentSchedule(){
 if(preview||!tizen.tvchannel){diagRecord('Schedule test requires the TV');return;}
 try{var c=tizen.tvchannel.getCurrentChannel();guideChannels=[c];guideIndex=0;programmeCache={};readSelectedSchedule(true);}catch(e){tunerError('Schedule probe failed',e);}
}

function guideMessage(text){document.getElementById('channel-message').textContent=text;}
function closeChannelGuide(){channelGuideOpen=false;scheduleSequence++;clearTimeout(scheduleTimer);guideGeneration++;clearTimeout(guideTimer);document.getElementById('channel-guide').className='hidden';if(mode==='tv-embedded')document.getElementById('live-return').focus();}
function renderChannelGuide(){
 var list=document.getElementById('channel-list');list.textContent='';
 guideChannels.forEach(function(c,i){var b=node('button',String(c.lcn||c.major||'')+'  '+(c.channelName||c.serviceName||'Channel'));b.className=i===guideIndex?'chosen':'';b.onclick=function(){guideIndex=i;tuneGuideChannel();};list.appendChild(b);});
 renderProgrammeDetails();var chosen=list.children[guideIndex];if(chosen){chosen.focus();list.scrollTop=Math.max(0,chosen.offsetTop-list.offsetTop-list.clientHeight/2);}
}
function openChannelGuide(){
 if(mode!=='tv-embedded'||document.hidden)return;
 if(channelGuideOpen){closeChannelGuide();return;}
 channelGuideOpen=true;document.getElementById('channel-guide').className='';guideMessage('Loading channels…');
 var generation=++guideGeneration,channels=[],seen={},offset=0;
 function active(){return channelGuideOpen&&generation===guideGeneration&&mode==='tv-embedded';}
 function fail(e){if(!active())return;clearTimeout(guideTimer);tunerError('Widget channel list failed',e);guideMessage('Unable to load channels. Press Return, then GUIDE to retry.');}
 function finish(){if(!active())return;clearTimeout(guideTimer);guideChannels=channels.sort(function(a,b){return Number(a.lcn||a.major||0)-Number(b.lcn||b.major||0);});guideIndex=0;try{var current=tizen.tvchannel.getCurrentChannel();guideChannels.forEach(function(c,i){if(c._serviceId===current._serviceId)guideIndex=i;});}catch(ignore){}renderChannelGuide();readSelectedSchedule(false);guideMessage(guideChannels.length?'Choose a channel · OK Watch · Return Close':'No channels returned');diagRecord('Widget guide loaded '+guideChannels.length+' channels; hidden='+document.hidden);}
 function page(){
  if(!active())return;clearTimeout(guideTimer);guideTimer=setTimeout(function(){fail({name:'TimeoutError'});},8000);
  try{tizen.tvchannel.getChannelList(function(batch){if(!active())return;clearTimeout(guideTimer);var added=0;batch.forEach(function(c){var id=String(c._serviceId||[c.major,c.minor,c.programNumber,c.channelName].join(':'));if(!seen[id]){seen[id]=true;channels.push(c);added++;}});offset+=batch.length;if(batch.length===50&&added&&offset<500)page();else finish();},fail,'ALL',offset,50);}catch(e){fail(e);}
 }
 document.getElementById('channel-list').textContent='';page();
}
function tuneGuideChannel(){
 if(channelBusy||!channelGuideOpen||!guideChannels.length)return;
 var channel=guideChannels[guideIndex],token=tvToken,done=false,timer;
 channelBusy=true;guideMessage('Tuning '+(channel.channelName||channel.serviceName||'channel')+'…');tunerValue('Widget guide tune request',channel);
 function finish(){if(done)return false;done=true;clearTimeout(timer);if(token===tvToken)channelBusy=false;return token===tvToken&&mode==='tv-embedded';}
 timer=setTimeout(function(){if(finish())guideMessage('Tuning timed out. Select a channel to retry.');},8000);
 try{tizen.tvchannel.tune(channel,{onsuccess:function(c){if(!finish())return;diagRecord('Widget guide tune succeeded; hidden='+document.hidden+'; mode='+mode);tunerValue('Selected channel',c);closeChannelGuide();},onnosignal:function(){if(finish())guideMessage('No signal for this channel. Choose another channel.');},onprograminforeceived:function(program){if(token===tvToken)tunerValue('Selected programme',program);}},function(e){if(!finish())return;tunerError('Widget guide tune failed',e);guideMessage('Tuning failed: '+e.name+'. Choose another channel.');});}catch(e){if(finish()){tunerError('Widget guide tune failed',e);guideMessage('Tuning failed: '+e.name+'. Choose another channel.');}}
}

// Embedded TV numeric channel entry (Room 1 pilot).
var numericChannel='',numericTimer=null,numericGeneration=0,channelDisplayTimer=null;
function showChannelNumber(value,label){
 var display=document.getElementById('channel-number-display');
 if(!display)return;
 clearTimeout(channelDisplayTimer);
 display.textContent=String(value);
 display.setAttribute('aria-label',(label||'Channel')+' '+value);
 display.className='visible';
 channelDisplayTimer=setTimeout(function(){display.className='hidden';},2500);
}
function hideChannelNumber(){
 clearTimeout(channelDisplayTimer);
 var display=document.getElementById('channel-number-display');
 if(display)display.className='hidden';
}
function resetNumericChannel(){clearTimeout(numericTimer);numericTimer=null;numericChannel='';numericGeneration++;}
function numericChannelKey(digit){
 if(mode!=='tv-embedded'||document.hidden)return;
 numericChannel=(numericChannel+digit).slice(-3);
 showChannelNumber(numericChannel,'Entering channel');
 guideMessage('Channel '+numericChannel);
 clearTimeout(numericTimer);
 numericTimer=setTimeout(function(){
  var wanted=Number(numericChannel),generation=++numericGeneration;
  numericChannel='';numericTimer=null;
  if(!wanted||channelBusy)return;
  showChannelNumber(wanted,'Selecting channel');
  var offset=0,found=false,seen=0;
  function active(){return generation===numericGeneration&&mode==='tv-embedded'&&!document.hidden;}
  function error(e){if(active())diagRecord('Number tune failed: '+(e.name||e.message||e));}
  function page(){
   if(!active()||found)return;
   try{tizen.tvchannel.getChannelList(function(batch){
    if(!active())return;
    for(var i=0;i<batch.length;i++){
     var c=batch[i],number=Number(c.lcn||c.major||0);
     if(number===wanted){
      found=true;channelBusy=true;
      var finished=false,timeout=setTimeout(function(){if(!finished){finished=true;channelBusy=false;diagRecord('Channel '+wanted+' tune timed out');}},8000);
      try{tizen.tvchannel.tune(c,{onsuccess:function(){if(finished)return;finished=true;clearTimeout(timeout);channelBusy=false;diagRecord('Channel '+wanted+' selected');showChannelNumber(wanted,'Channel');if(channelGuideOpen)closeChannelGuide();},onnosignal:function(){if(finished)return;finished=true;clearTimeout(timeout);channelBusy=false;diagRecord('Channel '+wanted+': no signal');}},function(e){if(finished)return;finished=true;clearTimeout(timeout);channelBusy=false;error(e);});}catch(e){clearTimeout(timeout);channelBusy=false;error(e);}
      return;
     }
    }
    offset+=batch.length;seen+=batch.length;
    if(batch.length===50&&seen<500)page();else diagRecord('Channel '+wanted+' not found');
   },error,'ALL',offset,50);}catch(e){error(e);}
  }
  page();
 },1200);
}
function registerChannelKeys(){
 if(preview)return;
 ['ChannelUp','ChannelDown'].forEach(function(name){try{var key=tizen.tvinputdevice.getKey(name);tizen.tvinputdevice.registerKey(name);diagRecord(name+' registered ('+(key?key.code:'unknown')+')');}catch(e){diagRecord(name+' registration: '+(e.name||e.message));}});
}
function scanTunerCapabilities(){
 if(preview){diagRecord('Tuner API scan requires the room TV.');return;}
 diagRecord('Tuner API scan 1.0.0 — read only; no tuning calls');
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
 panel.appendChild(action('Change this TV’s room assignment',changeRoomAssignment));
 heading('STAFF DIAGNOSTICS','TV diagnostics','Scan apps, then test a Guide or Channel List candidate. Home should return here. No apps are launched automatically.');
 panel.appendChild(action('Watch TV',startEmbeddedTV));
 panel.appendChild(action('TV Guide',launchGuide));
 panel.appendChild(action('Scan tuner APIs',scanTunerCapabilities));
 panel.appendChild(action('Read channel and programme data',readTunerData));panel.appendChild(action('Test current channel schedule',probeCurrentSchedule));
 panel.appendChild(action('Clear diagnostic log',function(){diagLog=[];diagRecord('Log cleared');render();}));
 panel.appendChild(action('Close widget',closeDiagnosticWidget));
 panel.appendChild(node('p','Exit test: closes this application. Test GUIDE and CH LIST on live TV, then HOME. If HOME does not restore the welcome screen, restart the TV.'));
 panel.appendChild(action('Scan installed apps',scanDiagnosticApps));
 panel.appendChild(action(diagAll?'Show Guide / Channel List candidates':'Show all app IDs',function(){diagAll=!diagAll;diagPage=0;render();}));
 var keyNames=diagKeys.filter(function(k){return /guide|channel|home/i.test(k.name);}).map(function(k){return k.name+' ('+k.code+')';});
 panel.appendChild(node('p','Private guest welcome TV code: '+(guestPairCode||'Waiting for connection')+'. Approve this code for Room '+room+' in the TV back office.'));
 panel.appendChild(node('p','Supported relevant keys: '+(keyNames.join(', ')||'none reported')+'. Version 1.2.2. Programme details and schedule diagnostics available. GUIDE opens an in-widget channel selector during embedded TV. Choose a channel with arrows and OK, then press GUIDE again. The native EPG test button still hands over to Samsung TV.'));
 var apps=diagApps?(diagAll?diagApps:diagApps.filter(diagCandidate)):[];
 if(diagApps&&!apps.length)panel.appendChild(node('p','No matching Guide / Channel List apps were reported. Show all app IDs to inspect the inventory.'));
 var pages=Math.max(1,Math.ceil(apps.length/6));diagPage=Math.min(diagPage,pages-1);
 if(apps.length){panel.appendChild(node('p','Apps page '+(diagPage+1)+' of '+pages));panel.appendChild(action('Previous apps',function(){diagPage=(diagPage+pages-1)%pages;render();}));panel.appendChild(action('Next apps',function(){diagPage=(diagPage+1)%pages;render();}));}
 apps.slice(diagPage*6,diagPage*6+6).forEach(function(app){var card=node('div','','info-card');card.appendChild(node('strong',app.name));card.appendChild(node('p',app.id));if(diagCandidate(app))card.appendChild(action('Test opening '+app.name,function(){diagLaunch(app);}));panel.appendChild(card);});
 panel.appendChild(node('h2','Diagnostic log'));var log=node('pre',diagLog.join('\n'),'diag-log');log.id='diag-log';panel.appendChild(log);
}
function launchMovies(){if(preview){say('Airtime opens on the room TV. It is not available in the browser preview.');return;}try{tizen.application.getAppsInfo(function(apps){var id=null;for(var i=0;i<apps.length;i++)if(apps[i].name.toLowerCase()==='airtime'){id=apps[i].id;break;}if(!id){say('Airtime is not installed on this TV.');return;}tizen.application.launch(id,function(){},function(e){say('Unable to open Airtime: '+e.name);});},function(e){say('Unable to find Airtime: '+e.name);});}catch(e){say('Unable to open Airtime: '+e.message);}}
function stopLive(){resetNumericChannel();hideChannelNumber();
 if(mode!=='tv-loading'&&mode!=='tv-embedded')return;
 welcomeGuidePending=false;closeChannelGuide();var embedded=mode==='tv-embedded';clearTimeout(channelTimer);channelTimer=null;channelBusy=false;tvToken++;clearTimeout(tvTimer);mode='menu';
 if(embedded){document.body.className='';document.documentElement.className='';document.getElementById('live-overlay').className='hidden';try{tizen.tvwindow.hide(function(){diagRecord('TVWindow hidden');},function(e){diagRecord('TVWindow hide: '+e.name);});}catch(e){diagRecord('TVWindow hide: '+(e.name||e.message));}}
}
function startEmbeddedTV(){if(welcomeMusic)welcomeMusic.pause();
 if(preview){welcomeGuidePending=false;say('Embedded antenna TV can only be tested on the room television.');return;}
 if(mode!=='menu')return;
 if(!tizen.tvwindow){welcomeGuidePending=false;diagRecord('TVWindow unavailable');say('TVWindow is unavailable. Native Watch TV remains available.');return;}
 stopWelcomeVideo();mode='tv-loading';var token=++tvToken;diagRecord('Starting embedded antenna TV');say('Opening antenna TV inside widget…');
 function failed(e){if(token!==tvToken)return;stopLive();embeddedGuideResume=false;diagRecord('Embedded TV failed: '+(e.name||e.message));say('Embedded TV failed: '+(e.name||e.message)+'. Use native Watch TV.');}
 function showTV(){if(token!==tvToken)return;try{tizen.tvwindow.show(function(rect){if(token!==tvToken){try{tizen.tvwindow.hide(function(){},function(){});}catch(ignore){}return;}clearTimeout(tvTimer);embeddedGuideResume=false;mode='tv-embedded';document.body.className='live';document.documentElement.className='live';document.getElementById('live-overlay').className='';document.getElementById('live-return').focus();diagRecord('Embedded TV visible; widget hidden='+document.hidden+'; rect='+rect.join(','));if(welcomeGuidePending){welcomeGuidePending=false;openChannelGuide();}},failed,['0%','0%','100%','100%'],'MAIN','BEHIND');}catch(e){failed(e);}}
 tvTimer=setTimeout(function(){failed({name:'TVWindow timed out'});},12000);
 try{var current=tizen.tvwindow.getSource();diagRecord('Current TV source: '+current.type);if(current.type==='TV'){showTV();return;}}catch(e){diagRecord('Source discovery: '+(e.name||e.message));}
 try{tizen.systeminfo.getPropertyValue('VIDEOSOURCE',function(info){if(token!==tvToken)return;var sources=info.connected||[],source=null;for(var i=0;i<sources.length;i++)if(sources[i].type==='TV'){source=sources[i];break;}if(!source){failed({name:'No TV tuner source reported'});return;}try{tizen.tvwindow.setSource(source,showTV,failed,'MAIN');}catch(e){failed(e);}},failed);}catch(e){failed(e);}
}
function startLive(){if(welcomeMusic)welcomeMusic.pause();
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
function playVideo(video){if(welcomeMusic)welcomeMusic.pause();if(!/^https:\/\//i.test(video.url)){say('This clip needs an HTTPS video address.');return;}stopLive();stopVideo();mode='video';document.body.className='playing';document.getElementById('video-overlay').className='';document.getElementById('clip-title').textContent=video.title;document.getElementById('clip-status').textContent='Loading…';clip.src=video.url;document.getElementById('video-return').focus();playClip();}
clip.addEventListener('playing',function(){document.getElementById('clip-status').textContent='Playing';});
clip.addEventListener('pause',function(){if(mode==='video')document.getElementById('clip-status').textContent='Paused · OK to continue';});
clip.addEventListener('waiting',function(){document.getElementById('clip-status').textContent='Buffering…';});
clip.addEventListener('error',function(){if(mode==='video')document.getElementById('clip-status').textContent='Clip could not play. Press Return to go back.';});
clip.addEventListener('ended',function(){stopVideo();open(navFor('videos'));});
function open(i){if(welcomeMusic)welcomeMusic.pause();var target=buttons[i].getAttribute('data-view');if(target==='diagnostics'&&!staffUnlocked){openStaffPIN();return;}if(target!=='diagnostics')staffUnlocked=false;cancelEmbeddedResume();diagKeyMode(false);stopLive();if(mode==='video')stopVideo();focus(i);view=target;if(view==='info')staySection='';panel.scrollTop=0;if(view==='diagnostics')diagKeyMode(true);render();if(view==='movies')launchMovies();else if(view==='live')startEmbeddedTV();}
for(var i=0;i<buttons.length;i++)(function(index){buttons[index].onclick=function(){open(index);};})(i);
document.getElementById('live-return').onclick=function(){embeddedGuideResume=false;stopLive();open(0);};
document.getElementById('video-return').onclick=function(){stopVideo();open(navFor('videos'));};
document.addEventListener('focusin',function(e){document.getElementById('help').textContent=e.target.parentNode===nav?'▲ ▼ Menu · OK Open · ▶ Explore · Return Welcome':'▲ ▼ Scroll · ◀ ▶ Choose · OK Open · Return Welcome';});
function isBack(k){return k===10009||k===27||k===8;}
document.addEventListener('keydown',function(e){var k=e.keyCode;if(staffPinKey(k)||staffShortcut(k,e.repeat)){e.preventDefault();return;}if(!room){var choices=panel.querySelectorAll('[data-action]');if(k===37||k===38)setupIndex=(setupIndex+5)%6;else if(k===39||k===40)setupIndex=(setupIndex+1)%6;else if(k===13){assignRoom(setupIndex+1);e.preventDefault();return;}if(choices[setupIndex])choices[setupIndex].focus();e.preventDefault();return;}if(k===guideCode||e.key==='Guide'){diagRecord('GUIDE received; hidden='+document.hidden+'; view='+view+'; mode='+mode);e.preventDefault();if(!e.repeat){if(mode==='tv-embedded')openChannelGuide();else if(mode==='tv-loading')welcomeGuidePending=true;else{if(mode==='video')stopVideo();cancelEmbeddedResume();view='live';welcomeGuidePending=true;startEmbeddedTV();}}return;}if(view==='diagnostics'&&mode==='menu')diagRecord('Key '+k+(e.key?' · '+e.key:''));
 if(mode==='tv-embedded'){if(k>=48&&k<=57){if(!e.repeat)numericChannelKey(String(k-48));e.preventDefault();return;}if(channelGuideOpen){if(k===38||k===40){guideIndex=Math.max(0,Math.min(guideChannels.length-1,guideIndex+(k===38?-1:1)));renderChannelGuide();readSelectedSchedule(false);}else if(k===13)tuneGuideChannel();else if(isBack(k))closeChannelGuide();e.preventDefault();return;}if(k===427||k===428){e.preventDefault();if(!e.repeat)changeEmbeddedChannel(k===427);return;}diagRecord('Embedded TV key '+k+(e.key?' · '+e.key:''));if(isBack(k)||k===13){embeddedGuideResume=false;stopLive();open(0);e.preventDefault();}return;}
 if(mode==='tv-loading'){if(isBack(k)){stopLive();open(0);e.preventDefault();}return;}
 if(mode==='video'){if(isBack(k)){stopVideo();open(navFor('videos'));}else if(k===13||k===10252){if(clip.paused)playClip();else clip.pause();}else if(k===415)playClip();else if(k===19)clip.pause();else if(k===413){stopVideo();open(navFor('videos'));}else if(k===37||k===39){if(isFinite(clip.duration)&&clip.duration>0)clip.currentTime=Math.max(0,Math.min(clip.duration,clip.currentTime+(k===37?-10:10)));}else return;e.preventDefault();return;}
 if(isBack(k)){if(view==='info'&&staySection){staySection='';panel.scrollTop=0;render();panel.querySelector('[data-action]').focus();}else open(0);e.preventDefault();return;}
 var active=document.activeElement,inNav=active&&active.parentNode===nav,actions=panel.querySelectorAll('[data-action]'),n=-1;for(var j=0;j<actions.length;j++)if(active===actions[j])n=j;
 if(k===13){if(inNav)open(selected);else if(n>=0)actions[n].click();e.preventDefault();}
 else if(moveStayFocus(k,active)){e.preventDefault();}
 else if(inNav&&(k===38||k===40)){focus(selected+(k===38?-1:1));e.preventDefault();}
 else if(inNav&&k===39){if(actions.length)actions[0].focus();else panel.focus();e.preventDefault();}
 else if(k===37){if(n>0)actions[n-1].focus();else focus(selected);e.preventDefault();}
 else if(k===39&&n>=0){actions[(n+1)%actions.length].focus();e.preventDefault();}
 else if(k===38||k===40){panel.scrollTop+=(k===38?-1:1)*Math.max(100,panel.clientHeight*.35);e.preventDefault();}
});
function valid(value){return value&&value.schemaVersion===1&&value.room&&value.room.id===room&&Array.isArray(value.pages)&&value.pages.length===3&&value.pages.every(function(p){return typeof p.title==='string'&&typeof p.text==='string';})&&Array.isArray(value.menus)&&Array.isArray(value.events)&&value.contact;}
function poll(){if(busy||!room)return;pollGuestWelcome();busy=true;var requestRoom=room;var xhr=new XMLHttpRequest();xhr.open('GET',url+'?v='+Date.now()+'&appVersion=1.2.6'+(preview?'&preview=1':''),true);xhr.timeout=10000;
 function failed(){busy=false;if(requestRoom!==room)return;if(Date.now()>noticeUntil)status.textContent=data?'Offline · showing saved hotel information':'Hotel information unavailable · retrying automatically';}
 xhr.onerror=failed;xhr.ontimeout=failed;xhr.onload=function(){busy=false;if(requestRoom!==room)return;try{if(xhr.status===404){data=null;try{localStorage.removeItem(cacheKey);}catch(ignore){}say('Cloud content is not enabled for this room.');render();return;}if(xhr.status!==200)throw Error('HTTP '+xhr.status);var next=JSON.parse(xhr.responseText);if(!valid(next))throw Error('Invalid hotel content');var changed=!data||data.revision!==next.revision;data=next;try{localStorage.setItem(cacheKey,JSON.stringify(data));}catch(ignore){}if(Date.now()>noticeUntil)status.textContent='Updated '+new Date().toLocaleTimeString();if(changed&&mode==='menu')render();}catch(e){failed();}};try{xhr.send();}catch(e){failed();}}
try{var cached=JSON.parse(localStorage.getItem(cacheKey));if(valid(cached)){data=cached;status.textContent='Showing saved hotel information · connecting…';}}catch(ignore){}
try{if(!preview&&tizen.tvinputdevice)['MediaPlayPause','MediaPlay','MediaPause','MediaStop','0','1','2','3','4','5','6','7','8','9'].forEach(function(key){try{tizen.tvinputdevice.registerKey(key);}catch(ignore){}});}catch(ignore){}
try{var savedLog=JSON.parse(sessionStorage.getItem('vl-epg-log'));if(Array.isArray(savedLog))diagLog=savedLog.slice(-100);}catch(ignore){}
registerGuide();registerChannelKeys();
function clock(){if(guestWelcome&&Date.parse(guestWelcome.expiresAt)<=Date.now())applyGuestWelcome(null);document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}clock();setInterval(clock,10000);
initWelcomeMusic();focus(0);render();poll();setInterval(poll,30000);promoTimer=setInterval(rotateWelcomePromo,20000);
function cancelEmbeddedResume(){clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;embeddedGuideResume=false;}
function scheduleEmbeddedResume(){
 clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;
 if(!embeddedGuideResume||document.hidden)return;
 diagRecord('Waiting 1500 ms of visible widget before TV restore');
 embeddedResumeTimer=setTimeout(function(){embeddedResumeTimer=null;if(document.hidden||!embeddedGuideResume)return;diagRecord('Stable visibility: restoring embedded TV');mode='menu';startEmbeddedTV();},1500);
}
function onWidgetVisibility(){
 diagRecord('Visibility: '+(document.hidden?'hidden':'visible'));
 if(document.hidden){if(welcomeMusic)welcomeMusic.pause();staffUnlocked=false;staffPinInput='';stopWelcomeVideo();clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;if(embeddedGuideResume)diagRecord('TV restore pending: widget hidden again');diagKeyMode(false);stopLive();if(mode==='video')stopVideo();}
 else{if(embeddedGuideResume){scheduleEmbeddedResume();poll();return;}if(diagResume){diagResume=false;open(navFor('diagnostics'));diagRecord('Returned to diagnostic widget.');}else open(0);poll();}
}
document.addEventListener('visibilitychange',onWidgetVisibility);
window.addEventListener('pagehide',function(){if(welcomeMusic)welcomeMusic.pause();clearInterval(promoTimer);clearTimeout(embeddedResumeTimer);embeddedResumeTimer=null;stopLive();if(mode==='video')stopVideo();});
})();


