const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let played=[],paused=[];
function node(tag,text,cls){return {tag,text,className:cls,paused:true,children:[],appendChild(c){this.children.push(c)},setAttribute(){},removeAttribute(){},load(){},pause(){paused.push(this.tag);this.paused=true;},play(){played.push(this.tag);this.paused=false;return Promise.resolve();}};}
const ctx={node,document:{createElement:node,hidden:false,body:node('body')},panel:node('main'),data:{welcomeVideo:{url:'https://example.com/upload.mp4'}},mode:'menu',view:'welcome',room:1,clearTimeout,diagRecord(){}};
vm.createContext(ctx);const source=fs.readFileSync(__dirname+'/hotel-tv-client/tv.js','utf8');vm.runInContext(source.slice(source.indexOf('var welcomeVideo=null'),source.indexOf('function render(){')),ctx);
ctx.renderWelcomeVideo();assert.equal(ctx.welcomeVideo.src,'lindus-combined-test.mp4');assert.equal(ctx.welcomeVideo.muted,false);assert.equal(played.filter(t=>t==='video').length,1);ctx.welcomeVideo.onended();assert.equal(played.filter(t=>t==='video').length,2);
ctx.initWelcomeMusic();assert.equal(ctx.welcomeMusic.src,'lindus-welcome-music.wav');assert.equal(ctx.welcomeMusic.loop,true);ctx.syncWelcomeMusic();assert.equal(ctx.welcomeMusic.volume,0.16);assert.equal(ctx.welcomeMusic.paused,false);ctx.view='local';ctx.syncWelcomeMusic();assert.equal(ctx.welcomeMusic.paused,true);ctx.view='welcome';ctx.document.hidden=true;ctx.syncWelcomeMusic();assert.equal(ctx.welcomeMusic.paused,true);
ctx.stopWelcomeVideo();assert.equal(ctx.welcomeVideo,null);assert(paused.includes('video'));assert.equal(38.25/68,9/16);
console.log('PASS: tested 1.2.11 media retained, video loops, welcome music stops outside welcome and when hidden');
