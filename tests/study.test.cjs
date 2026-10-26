'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const story=JSON.parse(script('story-data')),engine=script('game-engine');
function source(name){const a=engine.indexOf('function '+name+'('),b=engine.indexOf('\nfunction ',a+1);assert(a>=0,name);return engine.slice(a,b);}
function make(id){
 let now=0,dialog=false,count=0;const elements=new Map(),timers=new Map();
 function element(tag,cls='',value=''){
  return {tagName:tag.toUpperCase(),className:cls,textContent:value,dataset:{},children:[],style:{},disabled:false,hidden:false,
   classList:{values:new Set(),add(k){this.values.add(k);},remove(k){this.values.delete(k);},toggle(k,on){if(on)this.values.add(k);else this.values.delete(k);}},
   set id(v){this._id=v;elements.set(v,this);},get id(){return this._id;},
   setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},remove(){this.removed=true;},focus(){},
   matches(s){const m=/^\.([\w-]+)/.exec(s);return !!m&&(this.className.split(' ').includes(m[1])||this.classList.values.has(m[1]));},
   querySelectorAll(s){return this.children.flatMap(e=>[...(e.matches(s)?[e]:[]),...e.querySelectorAll(s)]);},querySelector(s){return this.querySelectorAll(s)[0]||null;},closest(s){return this.matches(s)?this:null;},
   getBoundingClientRect(){return this.rect||{left:0,top:0,right:800,bottom:400,width:800,height:400};},setPointerCapture(i){this.capture=i;},hasPointerCapture(i){return this.capture===i;},releasePointerCapture(){this.capture=null;}};
 }
 const $=name=>elements.get(name)||(()=>{const e=element('div');elements.set(name,e);return e;})();
 const context=vm.createContext({
  story,nodes:new Map(story.nodes.map(n=>[n.id,n])),current:story.nodes.find(n=>n.id===id),
  stations:['museum','tianmu','jiande','taihe','yishan','meitan','home'].map(id=>({id})),SAVE_VERSION:1,
  $,
  el:element,content:$('content'),controls:$('controls'),notice:$('notice'),mottoDrag:null,studyClock:null,pageVersion:0,playing:true,nameConfirmed:true,
  view:{mode:'story',nodeId:id,phase:'node',page:0},journey:{completed:[],pending:null,finaleStarted:false,history:[]},
  window:{addEventListener(){}},document:{hidden:false,querySelector(){return dialog?{}:null;},addEventListener(){}},
  performance:{now:()=>now},setInterval(fn){timers.set(++count,fn);return count;},clearInterval(i){timers.delete(i);},
  sound:{fx(){},lamp(){}},setScene(){},remember(){},autoSave(){},
  drawFeedback(){context.clearStudy();context.pageVersion++;},
 });
 vm.runInContext(script('game-core'),context);context.C=context.QiushiCore;context.state=context.C.createInitialState();context.state.nodeId=id;
 for(const name of ['apply','btn','feedback','saveSnapshot','validSave','stopStudyClock','cancelMottoDrag','clearStudy','studyCanRun','updateStudyClock','startStudyWait','sceneImagePath','placeMottoWord','submitMotto','finishMottoReason','shuffleMottoWords','showWords','flashStudy','checkProofLetter','proofSheet','showTypo','lightFeigongLamp','checkLampProof','showLampInteraction','releaseMottoWord'])vm.runInContext(source(name),context);
 return {c:context,$,timers,
  step(ms){now+=ms;for(const fn of [...timers.values()])fn();},
  dialog(value){dialog=value;context.updateStudyClock();},
  save(){return JSON.parse(JSON.stringify(context.saveSnapshot()));},
  restore(s){context.clearStudy();context.state=s.state;context.view=s.view;context.journey=s.journey;},
  pick(char){context.placeMottoWord(char);}};
}
test('motto uses two distinct draggable words and preserves the original +1 xinhuo reward after 3 s silence',()=>{
 const h=make('interaction-8'),c=h.c;c.showWords(c.current);
 const tile=h.$('study-surface').querySelectorAll('.motto-tile')[0];tile.click({detail:1});assert.equal(c.view.words.length,0);
 h.pick('求');h.pick('求');assert.equal(c.view.words.length,1);h.pick('是');assert.equal(h.$('study-surface').querySelectorAll('.motto-tile').length,8);c.submitMotto();
 assert.equal(c.state.xinhuo,1);assert.equal(c.state.mistakes,0);assert.equal(c.view.motto.phase,'silence');
 h.step(2000);assert.equal(c.view.phase,'node');h.dialog(true);h.step(60000);assert.equal(c.view.motto.wait,1000);
 const save=h.save();assert(c.validSave(save));h.restore(save);h.dialog(false);c.showWords(c.current);h.step(999);assert.equal(c.view.phase,'node');h.step(1);
 assert.equal(c.view.phase,'feedback');assert.equal(c.view.next,'anthem-meeting-context');assert.equal(c.state.xinhuo,1);
});
test('wrong motto records the original mistake once and requires the actual user reason',()=>{
 const h=make('interaction-8'),c=h.c;c.showWords(c.current);h.pick('力');h.pick('行');c.submitMotto();c.submitMotto();
 assert.equal(c.state.mistakes,1);assert.equal(c.state.xinhuo,0);assert.equal(c.view.motto.phase,'reason');assert.equal(c.state.journal.length,0);
 assert.equal(c.finishMottoReason('  '),false);assert.equal(c.view.phase,'node');
 c.view.motto.reason='先落实行动，再验证所学。';const save=h.save();assert(c.validSave(save));h.restore(save);c.showWords(c.current);
 assert.equal(h.$('motto-reason').value,'先落实行动，再验证所学。');assert(c.finishMottoReason(c.view.motto.reason));
 assert.equal(c.state.journal.length,1);assert.match(c.state.journal[0].text,/先落实行动，再验证所学/);assert.equal(c.state.mistakes,1);
});
test('motto drops outside a slot and pointer cancellation do not select a character',()=>{
 const h=make('interaction-8'),c=h.c;c.showWords(c.current);const stage=h.$('study-surface'),tile=stage.querySelectorAll('.motto-tile').find(e=>e.dataset.word==='求');
 tile.rect={left:10,top:150,right:60,bottom:200,width:50,height:50};stage.querySelectorAll('.motto-slot').forEach((e,i)=>e.rect={left:200+i*80,top:20,right:260+i*80,bottom:80,width:60,height:60});
 const e={target:tile,button:0,isPrimary:true,pointerId:4,clientX:20,clientY:160,preventDefault(){},stopPropagation(){}};
 stage.pointerdown(e);stage.pointermove({...e,clientX:100,clientY:100});stage.pointerup({...e,clientX:100,clientY:100});assert.equal(c.view.words.length,0);assert.equal(c.mottoDrag,null);
 stage.pointerdown(e);stage.pointermove({...e,clientX:230,clientY:50});stage.pointercancel({...e,clientX:230,clientY:50});assert.equal(c.view.words.length,0);
 stage.pointerdown(e);stage.pointermove({...e,clientX:230,clientY:50});stage.pointerup({...e,clientX:230,clientY:50});assert.equal(c.view.words[0],'求');
});
test('proofreading rewards a correct first answer once; a wrong first answer retains the original mistake through retries',()=>{
 const right=make('interaction-9'),c=right.c;c.showTypo(c.current);c.checkProofLetter(c.current,'党');assert.equal(c.state.qiuzhen,1);right.step(600);assert.equal(c.view.phase,'feedback');
 const h=make('interaction-9'),g=h.c;g.showTypo(g.current);g.checkProofLetter(g.current,'国');g.checkProofLetter(g.current,'头');
 assert.equal(g.state.mistakes,1);assert.equal(g.view.phase,'node');assert.equal(g.state.qiuzhen,0);
 const save=h.save();assert(g.validSave(save));h.restore(save);g.showTypo(g.current);g.checkProofLetter(g.current,'党');h.step(600);
 assert.equal(g.view.phase,'feedback');assert.equal(g.view.next,'scene-100');assert.equal(g.state.qiuzhen,0);assert.equal(g.state.mistakes,1);
});
test('clicking the desk lamp, proof errors and restoring drafts retain original +1 renxin only',()=>{
 const h=make('interaction-10'),c=h.c;c.showLampInteraction(c.current);assert.equal(c.view.lamp.step,'light');
 assert.equal(c.state.renxin,0);assert.equal(h.$('controls').children.length,0);assert.equal(h.$('light-lamp')['aria-label'],'点击点亮桌上的费巩灯');
 const received=h.save();assert(c.validSave(received));h.restore(received);c.showLampInteraction(c.current);h.$('light-lamp').click();c.lightFeigongLamp();
 assert.equal(c.state.renxin,1);assert.equal(c.state.lampLit,true);assert.equal(c.view.lamp.step,'proof');
 c.checkLampProof(0,'求');assert.equal(c.state.mistakes,0);c.checkLampProof(0,'事');c.checkLampProof(0,'事');assert.deepEqual(Array.from(c.view.lamp.found),[0]);
 const half=h.save();assert(c.validSave(half));h.restore(half);c.showLampInteraction(c.current);c.checkLampProof(1,'傅');
 h.step(899);assert.equal(c.view.phase,'node');assert(c.validSave(h.save()));h.step(1);assert.equal(c.view.phase,'feedback');assert.equal(c.view.next,'scene-107');
 assert.deepEqual([c.state.renxin,c.state.xinhuo,c.state.qiuzhen,c.state.mistakes],[1,0,0,0]);
});
test('legacy collection drafts resume with an unlit lamp already on the desk without scoring',()=>{
 const h=make('interaction-10'),c=h.c;c.view.lamp={step:'collect',found:[]};const save=h.save();assert(c.validSave(save));h.restore(save);
 c.showLampInteraction(c.current);assert.equal(c.view.lamp.step,'light');assert.equal(c.state.renxin,0);assert.equal(c.state.lampLit,false);assert.equal(h.$('controls').children.length,0);
 h.$('light-lamp').click();assert.equal(c.state.renxin,1);assert.equal(c.state.lampLit,true);
});
test('legacy completed lamp and v1 saves load without re-awarding points',()=>{
 const h=make('interaction-10'),c=h.c;c.state.lampLit=true;c.state.renxin=4;c.state.completedActions=['action:interaction-10'];
 assert(c.validSave(h.save()));c.showLampInteraction(c.current);assert.equal(c.view.phase,'feedback');assert.equal(c.state.renxin,4);
});
test('invalid interaction drafts are rejected and graphics paths remain relative',()=>{
 for(const [id,key,bad] of [['interaction-8','motto',{phase:'silence',reason:'',wait:3001}],['interaction-9','typo',{done:true,wait:-1}],['interaction-10','lamp',{step:'proof',found:[0,0]}],['interaction-8','motto',{phase:'reason',reason:''}],['interaction-9','typo',{done:false,wait:100}],['interaction-10','lamp',{step:'light',found:[0]}],['interaction-10','lamp',{step:'proof',found:[]}]]){
  const h=make(id),save=h.save();assert(h.c.validSave(save));save.view[key]=bad;assert.equal(h.c.validSave(save),false);
 }
 const h=make('interaction-8');assert.equal(h.c.sceneImagePath(h.c.current,'IMG-39'),'./assets/props/motto-board.webp');
 assert.equal(h.c.sceneImagePath({id:'interaction-9'},'IMG-14'),'./assets/props/proof-desk.webp');
 assert.equal(h.c.sceneImagePath({id:'interaction-10'},'IMG-14'),'./assets/props/dormitory-no-lamps.webp');
 assert.equal(h.c.sceneImagePath({id:'scene-107'},'IMG-14'),'./assets/props/dormitory-no-lamps.webp');
});

test('motto shuffles all eight unique words, separates the answer and keeps the draft order through rerenders and saves',()=>{
 const h=make('interaction-8'),c=h.c,seen=new Set();
 for(let i=0;i<300;i++){
  const order=Array.from(c.shuffleMottoWords());assert.deepEqual([...order].sort(),['求','是','力','行','敦','品','格','致'].sort());
  assert(!['求','是'].includes(order[0]));assert(Math.abs(order.indexOf('求')-order.indexOf('是'))>1);seen.add(order.join(''));
 }
 assert(seen.size>1);c.showWords(c.current);const order=Array.from(c.view.motto.order);
 h.pick('求');assert.deepEqual(Array.from(c.view.motto.order),order);
 const save=h.save();assert(c.validSave(save));h.restore(save);c.showWords(c.current);
 assert.deepEqual(Array.from(c.view.motto.order),order);assert.deepEqual(h.$('study-surface').querySelectorAll('.motto-tile').map(e=>e.dataset.word),order);
 assert.deepEqual([c.state.xinhuo,c.state.mistakes],[0,0]);
 for(const bad of [null,[],['求','求','力','行','敦','品','格','致'],['求','是','力','行','敦','品','格','外']]){
  const invalid=h.save();invalid.view.motto.order=bad;assert.equal(c.validSave(invalid),false);
 }
});
