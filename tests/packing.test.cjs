'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const story=JSON.parse(script('story-data')),engine=script('game-engine');
function source(name){const start=engine.indexOf('function '+name+'('),end=engine.indexOf('\nfunction ',start+1);assert(start>=0,name);return engine.slice(start,end);}
function harness(){
 let now=0,dialog=false,seq=0;const elements=new Map(),timers=new Map();
 function el(tag,cls='',text=''){
  const e={tagName:tag.toUpperCase(),className:cls,textContent:text,children:[],dataset:{},style:{setProperty(k,v){this[k]=v;}},hidden:false,disabled:false,clientWidth:800,clientHeight:450,
   classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
   set id(v){this._id=v;elements.set(v,this);},get id(){return this._id;},addEventListener(k,fn){this[k]=fn;},
   matches(s){return this.className.split(' ').includes(s.slice(1));},closest(s){return this.matches(s)?this:null;},
   querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);},
   getBoundingClientRect(){return {left:0,top:0,width:800,height:450};},setPointerCapture(id){this.captured=id;},hasPointerCapture(id){return this.captured===id;},releasePointerCapture(){this.captured=null;}};return e;
 }
 const $=id=>elements.get(id)||(()=>{const e=el('div');e.id=id;return e;})();
 $('packing-stage').hidden=true;
 const c=vm.createContext({story,nodes:new Map(story.nodes.map(n=>[n.id,n])),stations:['museum','tianmu','jiande','taihe','yishan','meitan','home'].map(id=>({id})),
  $,el,controls:$('controls'),content:$('content'),packingDrag:null,studyClock:null,playing:true,nameConfirmed:true,SAVE_VERSION:1,
  journey:{completed:['museum'],pending:null,finaleStarted:false,history:[]},
  document:{hidden:false,querySelector:()=>dialog?{}:null,addEventListener(){}},window:{},performance:{now:()=>now},
  setInterval(fn){timers.set(++seq,fn);return seq;},clearInterval(id){timers.delete(id);},
  finishTyping(){},typeBody(){},autoSave(){},remember(){},feedback(message,next){c.clearPacking();c.view.phase='feedback';c.view.message=message;c.view.next=next;},
 });
 vm.runInContext(script('game-core'),c);c.C=c.QiushiCore;
 for(const name of ['apply','saveSnapshot','validSave','packingItemLayout','packingTarget','packingArtworkBounds','layoutPacking','cancelPackingDrag','clearPacking','packingCanRun','finishPacking','placePackingItem','packingDropAllowed','releasePackingItem','showPacking','stopStudyClock','studyCanRun','updateStudyClock','startStudyWait'])vm.runInContext(source(name),c);
 c.state=c.C.createInitialState();c.state.nodeId='interaction-4';c.current=c.nodes.get('interaction-4');c.view={nodeId:'interaction-4',mode:'story',phase:'node',page:0};
 function render(){c.showPacking(c.current);}
 function drag(id,x,y,cancelled=false){const s=$('packing-stage'),item=s.querySelectorAll('.packing-item').find(e=>e.dataset.item===id),event={target:item,button:0,isPrimary:true,pointerId:1,clientX:500,clientY:400,preventDefault(){},stopPropagation(){}};s.pointerdown(event);s.pointermove({...event,clientX:x,clientY:y});s[cancelled?'pointercancel':'pointerup']({...event,clientX:x,clientY:y});}
 return {c,$,timers,render,drag,step(ms){now+=ms;for(const fn of [...timers.values()])fn();},setDialog(v){dialog=v;c.updateStudyClock();}};
}
test('packing accepts either order, settles once and keeps all scores unchanged',()=>{
 for(const order of [['luggage','books'],['books','luggage']]){
  const h=harness();h.render();const scores=['renxin','xinhuo','qiuzhen','mistakes'].map(k=>h.c.state[k]);
  h.c.placePackingItem(order[0]);h.c.placePackingItem(order[0]);assert.equal(h.c.view.packing.placed.length,1);
  h.c.placePackingItem(order[1]);h.step(899);assert.equal(h.c.view.phase,'node');h.step(1);
  assert.equal(h.c.view.phase,'feedback');assert.equal(h.c.view.next,'scene-020');assert.equal(h.$('packing-stage').hidden,true);
  assert.deepEqual(['renxin','xinhuo','qiuzhen','mistakes'].map(k=>h.c.state[k]),scores);assert.equal(h.c.state.completedActions.filter(k=>k==='action:interaction-4').length,1);
  h.c.finishPacking();h.render();assert.equal(h.c.state.completedActions.filter(k=>k==='action:interaction-4').length,1);
 }
});
test('mouse click, wrong destination and cancellation leave items at their source',()=>{
 const h=harness();h.render();const stage=h.$('packing-stage');
 stage.querySelectorAll('.packing-item')[0].click({detail:1,stopPropagation(){}});assert.equal(h.c.view.packing.placed.length,0);
 h.drag('books',150,330);h.drag('luggage',650,220);h.drag('books',680,220,true);assert.equal(h.c.view.packing.placed.length,0);assert.equal(h.c.packingDrag,null);
 h.drag('books',680,220);assert.equal(h.c.view.packing.placed[0],'books');h.drag('luggage',150,330);assert.equal(h.c.view.packing.placed.length,2);
});
test('partial v1 saves resume either order, and older completed actions do not replay',()=>{
 for(const first of ['books','luggage']){const h=harness();h.render();h.c.placePackingItem(first);const saved=JSON.parse(JSON.stringify(h.c.saveSnapshot()));assert(h.c.validSave(saved));h.c.clearPacking();h.c.view.mode='map';h.c.view=saved.view;h.render();assert.equal(h.c.view.packing.placed[0],first);assert.equal(h.$('packing-stage').querySelectorAll('.packing-item').filter(b=>b.disabled).length,1);}
 const old=harness();old.c.state.completedActions.push('action:interaction-4');assert(old.c.validSave(old.c.saveSnapshot()));old.render();assert.equal(old.c.view.phase,'feedback');assert.equal(old.$('packing-stage').hidden,true);assert.equal(old.timers.size,0);
});
test('completion wait pauses in dialogs, background and map, then resumes from a valid save',()=>{
 const h=harness();h.render();h.c.placePackingItem('luggage');h.c.placePackingItem('books');h.step(200);h.setDialog(true);h.step(60000);assert.equal(h.c.view.packing.wait,700);h.setDialog(false);
 h.c.document.hidden=true;h.c.updateStudyClock();h.step(60000);assert.equal(h.c.view.packing.wait,700);h.c.document.hidden=false;h.c.updateStudyClock();
 h.c.stopStudyClock();h.c.clearPacking();h.c.view.mode='map';h.step(60000);assert.equal(h.c.view.packing.wait,700);assert(h.c.validSave(h.c.saveSnapshot()));h.c.view.mode='story';h.render();h.step(700);assert.equal(h.c.view.phase,'feedback');
});
test('malformed or misplaced packing drafts are rejected and missing drafts remain compatible',()=>{
 const h=harness();assert(h.c.validSave(h.c.saveSnapshot()));
 for(const p of [null,{}, {placed:['books','books']},{placed:['other']},{placed:['luggage'],wait:100},{placed:['books','luggage'],wait:901},{placed:['books','luggage'],wait:-1}]){const s=JSON.parse(JSON.stringify(h.c.saveSnapshot()));s.view.packing=p;assert.equal(h.c.validSave(s),false);}
 const s=JSON.parse(JSON.stringify(h.c.saveSnapshot()));s.state.nodeId=s.view.nodeId='scene-020';s.view.packing={placed:[]};assert.equal(h.c.validSave(s),false);
});
test('desktop fills the scene without clipping drag endpoints; portrait retains both ends',()=>{
 const h=harness();for(const [w,height] of [[1080,469],[760,420],[374,414],[1080,250]]){const a=h.c.packingArtworkBounds(w,height);assert(Math.abs(a.width/a.height-2730/1536)<.001);
  if(w/height>=1.55&&w/height<=2.65){assert(a.x<=.01&&a.y<=.01&&a.x+a.width>=w-.01&&a.y+a.height>=height-.01);}else{assert(a.x>=-.01&&a.y>=-.01&&a.x+a.width<=w+.01&&a.y+a.height<=height+.01);}
  for(const id of ['books','luggage'])for(const placed of [false,true]){const p=h.c.packingItemLayout(id,placed),x=a.x+p.x*a.width,y=a.y+p.y*a.height;assert(x>0&&x<w&&y>0&&y<height);}
 }
});
test('read-only reviews show the initial room before acting and the finished room for action and feedback',()=>{
 const h=harness();vm.runInContext(source('sceneImagePath'),h.c);const n=h.c.current;
 assert.match(h.c.sceneImagePath(n,n.bg,{id:'node:interaction-4'}),/packing-start/);
 for(const id of ['action:interaction-4','feedback:interaction-4:done'])assert.match(h.c.sceneImagePath(n,n.bg,{id}),/packing-finished/);
 assert.equal(h.c.state.completedActions.length,0);assert.equal(h.c.view.packing,undefined);
});
