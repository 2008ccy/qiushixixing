'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const story=JSON.parse(script('story-data')),engine=script('game-engine');
function source(name){const a=engine.indexOf('function '+name+'('),b=engine.indexOf('\nfunction ',a+1);assert(a>=0,name);return name==='advance'?engine.slice(a).split('\n')[0]:engine.slice(a,b);}
function harness(){
 let now=0,dialog=false,reduced=false,serial=0;const elements=new Map(),timers=new Map();
 function element(){return {hidden:false,complete:true,style:{},children:[],attributes:{},classList:{values:new Set(),add(k){this.values.add(k);},remove(k){this.values.delete(k);}},append(item){this.children.push(item);},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};}
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const c=vm.createContext({$,el:element,story,nodes:new Map(story.nodes.map(n=>[n.id,n])),SAVE_VERSION:1,stations:['museum','tianmu','jiande','taihe','yishan','meitan','home'].map(id=>({id})),
  view:{mode:'story',nodeId:'scene-048',phase:'node',page:0},document:{hidden:false,body:{dataset:{}},querySelector:()=>dialog?{}:null},window:{matchMedia:()=>({matches:reduced})},
  performance:{now:()=>now},setInterval(fn){timers.set(++serial,fn);return serial;},clearInterval(id){timers.delete(id);},
  autoSave(){c.saves++;},saves:0,advances:0,finished:0,typeState:{},finishTyping(){c.finished++;c.typeState=null;},advanceAction(){c.advances++;}});
 vm.runInContext('let blackoutClock=null;',c);
 for(const name of ['renderAnthemGallery','stopBlackout','drawBlackout','updateBlackout','startBlackout','advance','validSave','stopTimeFlash','playTimeFlash'])vm.runInContext(source(name),c);
 return {c,$,timers,step(ms){now+=ms;for(const fn of [...timers.values()])fn();},dialog(value){dialog=value;c.updateBlackout();},reduced(value){reduced=value;}};
}
test('all three score pages appear in order in story and read-only review, then clear on other scenes',()=>{
 const h=harness();for(const review of [false,true]){
  for(const bg of ['IMG-40','IMG-41','IMG-42']){
   h.c.renderAnthemGallery(bg,review);const gallery=h.$(review?'review-anthem-gallery':'anthem-gallery');
   assert.equal(gallery.hidden,false);assert.deepEqual(Array.from(gallery.children,p=>p.src),['./assets/images/IMG-40.webp','./assets/images/IMG-42.webp','./assets/images/IMG-41.webp']);
   assert.equal(h.$(review?'review-image':'scene-image').hidden,true);
  }
  h.c.renderAnthemGallery('IMG-13',review);assert.equal(h.$(review?'review-anthem-gallery':'anthem-gallery').hidden,true);assert.equal(h.$(review?'review-image':'scene-image').hidden,false);
 }
});
test('blackout blocks both typewriter completion and advance until the 3.2 s transition ends',()=>{
 const h=harness(),c=h.c;c.startBlackout({id:'scene-048'});c.advance();assert.equal(c.finished,0);assert.equal(c.advances,0);
 h.step(600);assert.equal(h.$('lantern-before').style.opacity,'1');h.step(1100);assert.equal(h.$('lantern-before').style.opacity,'0.5');c.advance();assert.equal(c.finished,0);
 h.step(1500);assert.equal(c.view.blackout.elapsed,3200);assert.equal(h.$('lantern-before').hidden,true);assert.equal(h.timers.size,0);assert.equal(c.saves,1);
 c.advance();assert.equal(c.finished,1);c.advance();assert.equal(c.advances,1);
 c.startBlackout({id:'scene-048'});assert.equal(h.timers.size,0);
});
test('blackout pauses for loading, dialogs and background, and resumes its saved position after map cancellation',()=>{
 const h=harness(),c=h.c;h.$('scene-image').complete=false;c.startBlackout({id:'scene-048'});h.step(9000);assert.equal(c.view.blackout.elapsed,0);
 h.$('scene-image').complete=true;c.updateBlackout();h.step(1200);assert.equal(c.view.blackout.elapsed,1200);
 h.dialog(true);h.step(20000);assert.equal(c.view.blackout.elapsed,1200);h.dialog(false);
 c.document.hidden=true;c.updateBlackout();h.step(10000);assert.equal(c.view.blackout.elapsed,1200);c.document.hidden=false;c.updateBlackout();
 const saved=JSON.parse(JSON.stringify(c.view));c.stopBlackout();h.step(5000);assert.equal(c.view.blackout.elapsed,1200);
 c.view=saved;c.startBlackout({id:'scene-048'});h.step(2000);assert.equal(c.view.blackout.elapsed,3200);
});
test('reduced motion uses a static switch and still protects the transition from input',()=>{
 const h=harness(),c=h.c;h.reduced(true);c.startBlackout({id:'scene-048'});h.step(1690);assert.equal(h.$('lantern-before').style.opacity,'1');h.step(20);assert.equal(h.$('lantern-before').style.opacity,'0');c.advance();assert.equal(c.finished,0);
});
test('v1 saves accept absent and valid blackout drafts and reject malformed or misplaced drafts',()=>{
 const {c}=harness();vm.runInContext(script('game-core'),c);const state=c.QiushiCore.createInitialState();state.nodeId='scene-048';
 const save={version:1,savedAt:new Date().toISOString(),nameConfirmed:true,state,journey:{completed:[],pending:null,finaleStarted:false,history:[]},view:{...c.view}};
 assert(c.validSave(save));for(const elapsed of [0,1200,3200]){save.view.blackout={elapsed};assert(c.validSave(save));}
 for(const draft of [null,{}, {elapsed:-1},{elapsed:3201},{elapsed:'1200'},{elapsed:NaN}]){save.view.blackout=draft;assert.equal(c.validSave(save),false);}
 save.view.blackout={elapsed:1200};save.state.nodeId=save.view.nodeId='scene-049';assert.equal(c.validSave(save),false);
});

test('both time travels flash once per view and ordinary scenes never trigger it',()=>{
 const h=harness(),c=h.c,flash=h.$('time-flash');
 for(const id of ['scene-005','scene-137']){
  c.view={mode:'story',nodeId:id,phase:'node',page:0};c.playTimeFlash({id});
  assert.equal(flash.hidden,false);assert(flash.classList.values.has('active'));assert.equal(c.view.flashShown,true);
  c.stopTimeFlash();assert.equal(flash.hidden,true);assert.equal(flash.classList.values.has('active'),false);
  c.playTimeFlash({id});assert.equal(flash.hidden,true);
 }
 c.view={mode:'story',nodeId:'scene-004',phase:'node',page:0};c.playTimeFlash({id:'scene-004'});assert.equal(flash.hidden,true);assert.equal(c.view.flashShown,undefined);
 assert.match(html,/#time-flash\{position:fixed;inset:0;width:100vw;height:100dvh;background:#fff/);
 assert.match(html,/@keyframes time-flash\{0%\{opacity:0\}18%,38%\{opacity:1\}100%\{opacity:0\}\}/);
});
test('v1 saves allow the optional flash completion marker only on the two time-travel scenes',()=>{
 const {c}=harness();vm.runInContext(script('game-core'),c);
 const save={version:1,savedAt:new Date().toISOString(),nameConfirmed:true,state:c.QiushiCore.createInitialState(),journey:{completed:[],pending:null,finaleStarted:false,history:[]},view:{mode:'story',phase:'node',page:0}};
 for(const id of ['scene-005','scene-137']){
  save.state.nodeId=save.view.nodeId=id;delete save.view.flashShown;assert(c.validSave(save));
  save.view.flashShown=true;assert(c.validSave(save));save.view.flashShown='true';assert.equal(c.validSave(save),false);
 }
 save.view.flashShown=true;save.state.nodeId=save.view.nodeId='scene-004';assert.equal(c.validSave(save),false);
});
