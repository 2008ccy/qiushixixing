'use strict';
// Run the shipped interaction callbacks with a controlled clock and minimal DOM.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const story=JSON.parse(script('story-data')),engine=script('game-engine');
function source(name){const start=engine.indexOf('function '+name+'('),end=engine.indexOf('\nfunction ',start+1);assert(start>=0,name);return engine.slice(start,end);}
function harness(){
  let now=0,dialog=false,interval=0;
  const timers=new Map(),elements=new Map(),saved=[];
  function element(tag,cls='',text=''){
    return {tagName:tag.toUpperCase(),className:cls,textContent:text,dataset:{},hidden:false,disabled:false,children:[],
      style:{values:{},setProperty(k,v){this.values[k]=String(v);}},
      classList:{values:new Set(),add(k){this.values.add(k);},remove(k){this.values.delete(k);},toggle(k,on){if(on)this.values.add(k);else this.values.delete(k);}},
      clientWidth:800,clientHeight:260,
      matches(selector){const crate=/data-crate="(\d+)"/.exec(selector);if(crate)return this.dataset.crate===Number(crate[1]);const cls=/^\.([\w-]+)/.exec(selector);return !!cls&&(this.className.split(' ').includes(cls[1])||this.classList.values.has(cls[1]))&&(!selector.includes(':not(:disabled)')||!this.disabled);},
      querySelectorAll(selector){return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
      closest(selector){return this.matches(selector)?this:null;},
      getBoundingClientRect(){return {left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:parseFloat(this.style.width)||this.clientWidth,height:parseFloat(this.style.height)||this.clientHeight};},
      setPointerCapture(id){this.captured=id;},hasPointerCapture(id){return this.captured===id;},releasePointerCapture(){this.captured=null;},
      set id(value){elements.set(value,this);this._id=value;},get id(){return this._id;},
      setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;},
      append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
      remove(){this.removed=true;},focus(){this.focused=true;}};
  }
  const $=id=>elements.get(id)||(()=>{const e=element('div');elements.set(id,e);return e;})();
  const context=vm.createContext({
    story,nodes:new Map(story.nodes.map(n=>[n.id,n])),
    stations:['museum','tianmu','jiande','taihe','yishan','meitan','home'].map(id=>({id})),
    window:{addEventListener(){}},getComputedStyle(){return {objectFit:'cover'};},rescueDrag:null,
    document:{hidden:false,body:{dataset:{}},querySelector(){return dialog?{}:null;},addEventListener(){}},
    performance:{now:()=>now},setInterval(fn){timers.set(++interval,fn);return interval;},clearInterval(id){timers.delete(id);},
    $,el:element,controls:$('controls'),content:$('content'),notice:$('notification'),
    sound:{fx(){}},pageVersion:0,rescueClock:null,typeState:null,playing:true,nameConfirmed:true,
    SAVE_VERSION:1,journey:{completed:['museum','tianmu','jiande'],pending:null,finaleStarted:false,history:[]},
    text:String,remember(){},typeBody(){},finishTyping(){},
    autoSave(){saved.push(JSON.parse(JSON.stringify({state:context.state,view:context.view})));},
    drawFeedback(){context.pageVersion++;context.controls.replaceChildren();},
  });
  vm.runInContext(script('game-core'),context);context.C=context.QiushiCore;
  for(const name of ['apply','btn','feedback','saveSnapshot','validSave','rescueArtworkBounds','rescueLayout','rescueBookPosition','currentRescueLayout','layoutRescueBooks','cancelRescueDrag','stopRescueClock','rescueCanRun','updateRescueClock','finishBookRescue','placeRescueBook','rescueDropAllowed','releaseRescueBook','showBookRescue'])vm.runInContext(source(name),context);
  context.state=context.C.createInitialState();Object.assign(context.state,{nodeId:'interaction-7',protectBooks:true,bookIntegrity:1,xinhuo:2});
  context.current=context.nodes.get('interaction-7');context.view={mode:'story',nodeId:'interaction-7',phase:'node',page:0};
  function render(){context.controls.replaceChildren();context.showBookRescue(context.current);}
  function click(id){const b=id==='start'?$('start-rescue'):$('book-rescue').children.find(b=>b.dataset.crate===id);assert(b&&!b.disabled,'enabled button '+id);b.click({detail:0});}
  function drag(index,x,y,cancelled=false){
    const stage=$('book-rescue'),book=stage.querySelector('[data-crate="'+index+'"]'),rect=book.getBoundingClientRect();
    const event={button:0,isPrimary:true,pointerId:1,target:book,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,preventDefault(){},stopPropagation(){}};
    stage.pointerdown(event);stage.pointermove({...event,clientX:x,clientY:y});stage[cancelled?'pointercancel':'pointerup']({...event,clientX:x,clientY:y});
  }
  return {context,$,saved,timers,render,click,drag,
    elapse(ms){now+=ms;},
    step(ms){now+=ms;for(const fn of [...timers.values()])fn();},
    setDialog(value){dialog=value;context.updateRescueClock();}};
}
test('interaction 7 is an action; reading instructions does not start the timer',()=>{
  const h=harness();h.render();h.step(60000);
  assert.equal(h.context.current.type,'action');assert.equal(h.context.current.choices,undefined);
  assert.equal(h.context.view.rescue.remaining,12000);assert.equal(h.timers.size,0);
});
test('four distinct crates reward xinhuo once and retain existing book integrity',()=>{
  const h=harness();h.render();h.click('start');h.step(1000);
  h.click(0);h.click(1);h.click(2);h.click(3);
  assert.equal(h.context.state.xinhuo,2);assert.equal(h.context.view.phase,'node');assert.equal(h.$('book-rescue').hidden,false);
  h.step(1400);assert.equal(h.context.view.phase,'node');h.step(100);
  assert.equal(h.context.state.xinhuo,3);assert.equal(h.context.state.bookIntegrity,1);
  assert.equal(h.context.state.mistakes,0);assert.equal(h.context.view.phase,'feedback');assert.equal(h.context.view.next,'scene-077');
  assert.equal(h.timers.size,0);assert.equal(h.$('rescue-edge').hidden,true);
  h.context.finishBookRescue(true);assert.equal(h.context.state.xinhuo,3);
  const other=harness();other.context.state.bookIntegrity=0;other.render();other.click('start');for(let i=0;i<4;i++)other.click(i);other.step(1500);
  assert.equal(other.context.state.bookIntegrity,0,'success does not repair previously damaged books');
});
test('timeout and a click at the deadline cause only one integrity loss, no reward or mistake',()=>{
  const h=harness();h.render();h.click('start');h.click(0);h.step(12000);
  assert.equal(h.context.state.bookIntegrity,0);assert.equal(h.context.state.xinhuo,2);assert.equal(h.context.state.mistakes,0);
  assert.match(h.context.view.message,/一函书已经受潮/);h.context.finishBookRescue(false);assert.equal(h.context.state.bookIntegrity,0);
  const last=harness();last.render();last.click('start');for(let i=0;i<3;i++)last.click(i);last.elapse(12000);last.click(3);
  assert.equal(last.context.state.xinhuo,2);assert.equal(last.context.state.bookIntegrity,0,'last click at deadline loses');
});
test('dialogs and background pause the clock; edge pulse accelerates as time runs out',()=>{
  const h=harness();h.render();h.click('start');h.step(1000);
  const slow=parseFloat(h.$('rescue-edge').style.values['--rescue-pulse']);
  h.setDialog(true);const remaining=h.context.view.rescue.remaining;h.step(60000);assert.equal(h.context.view.rescue.remaining,remaining);
  h.setDialog(false);h.step(1000);assert.equal(h.context.view.rescue.remaining,remaining-1000);
  h.context.document.hidden=true;h.context.updateRescueClock();h.step(60000);assert.equal(h.context.view.rescue.remaining,remaining-1000);
  h.context.document.hidden=false;h.context.updateRescueClock();h.step(7000);
  assert.equal(h.$('rescue-edge').dataset.urgency,'urgent');assert(parseFloat(h.$('rescue-edge').style.values['--rescue-pulse'])<slow);
});
test('map interruption, save and restore preserve moved crates, remaining time and deduplication',()=>{
  const h=harness();h.render();h.click('start');h.step(3500);h.click(0);h.click(2);
  h.context.stopRescueClock();h.context.view.mode='map';h.step(60000);assert.equal(h.context.view.rescue.remaining,8500);
  const saved=JSON.parse(JSON.stringify(h.context.saveSnapshot()));assert(h.context.validSave(saved));
  h.context.state=saved.state;h.context.view=saved.view;h.context.view.mode='story';h.render();
  assert.equal(h.context.view.rescue.remaining,8500);assert.equal(h.$('book-rescue').children.filter(b=>b.classList.values.has('secured')).length,2);
  h.click(1);h.click(3);h.step(1500);assert.equal(h.context.state.xinhuo,3);
  assert(h.context.validSave(JSON.parse(JSON.stringify(h.context.saveSnapshot()))));
});
test('old shelter/push saves retain their result without replaying the action or effects',()=>{
  for(const [key,integrity,score] of [['shelter',1,3],['push',0,2]]){
    const h=harness();h.context.state.completedActions=['choice:interaction-7:'+key];h.context.state.bookIntegrity=integrity;h.context.state.xinhuo=score;
    assert(h.context.validSave(h.context.saveSnapshot()));h.render();assert.equal(h.context.view.phase,'feedback');
    assert.equal(h.context.state.bookIntegrity,integrity);assert.equal(h.context.state.xinhuo,score);assert.equal(h.timers.size,0);
  }
});
test('malformed rescue drafts are rejected while older v1 saves remain valid',()=>{
  const h=harness();assert(h.context.validSave(h.context.saveSnapshot()));
  for(const rescue of [{started:true,remaining:-1,moved:[]},{started:true,remaining:100,moved:[1,1]},{started:true,remaining:100,moved:[4]},{started:false,remaining:100,moved:[]},{started:true,remaining:100,moved:[0,1,2,3],settleRemaining:1501},{started:true,remaining:100,moved:[0],settleRemaining:500},null]){
    const s=JSON.parse(JSON.stringify(h.context.saveSnapshot()));s.view.rescue=rescue;assert.equal(h.context.validSave(s),false);
  }
});

test('mouse clicks do not place books; only a drop on the ledge counts and cancelled drags return home',()=>{
  const h=harness();h.render();h.click('start');
  const stage=h.$('book-rescue'),book=stage.querySelector('[data-crate="0"]');
  book.click({detail:1});assert.equal(h.context.view.rescue.moved.length,0);
  h.drag(0,100,100);assert.equal(h.context.view.rescue.moved.length,0);
  h.drag(0,600,150,true);assert.equal(h.context.view.rescue.moved.length,0);assert.equal(h.context.rescueDrag,null);
  const l=h.context.rescueLayout(800,260);h.drag(0,l.left+30,l.surface-20);
  assert.equal(h.context.view.rescue.moved.length,1);assert.equal(h.context.rescueDrag,null);assert(book.disabled);
});
test('book alpha baseline touches the shelf or the book below, regardless of drag order',()=>{
  const h=harness();
  for(const width of [330,800]){
    const l=h.context.rescueLayout(width,220),moved=[3,0,2,1];
    const points=moved.map(i=>h.context.rescueBookPosition(i,l,moved,220));
    assert(Math.abs(points[0].y+l.bookHeight*.93-l.surface)<.01);
    assert(Math.abs(points[1].y+l.bookHeight*.93-l.surface)<.01);
    assert(Math.abs(points[2].y+l.bookHeight*.93-(points[0].y+l.bookHeight*.092))<.01);
    for(const p of points)assert(p.x>=l.platformLeft&&p.x+l.bookWidth<=width);
  }
});
test('the last book stays visible for 1.5 s and settling survives saves and pauses',()=>{
  const h=harness();h.render();h.click('start');for(let i=0;i<4;i++)h.click(i);
  h.step(500);h.setDialog(true);h.step(60000);assert.equal(h.context.view.rescue.settleRemaining,1000);
  const save=JSON.parse(JSON.stringify(h.context.saveSnapshot()));assert(h.context.validSave(save));
  h.context.stopRescueClock();h.context.state=save.state;h.context.view=save.view;h.setDialog(false);h.render();
  h.step(999);assert.equal(h.$('book-rescue').hidden,false);assert.equal(h.context.state.xinhuo,2);
  h.step(1);assert.equal(h.context.view.phase,'feedback');assert.equal(h.context.state.xinhuo,3);
});

test('timeout while holding a book releases capture and prevents a late drop from scoring',()=>{
  const h=harness();h.render();h.click('start');const stage=h.$('book-rescue'),book=stage.querySelector('[data-crate="0"]'),r=book.getBoundingClientRect();
  const e={pointerId:7,button:0,isPrimary:true,target:book,clientX:r.left+20,clientY:r.top+20,preventDefault(){},stopPropagation(){}};
  stage.pointerdown(e);assert(h.context.rescueDrag);assert(book.hasPointerCapture(7));
  h.step(12000);assert.equal(h.context.rescueDrag,null);assert.equal(book.hasPointerCapture(7),false);
  stage.pointerup({...e,clientX:600,clientY:150});assert.equal(h.context.state.xinhuo,2);assert.equal(h.context.state.bookIntegrity,0);
  assert.equal(h.$('book-rescue').hidden,true);
});

test('scene anchors keep the source on the cart and the destination on the background ledge in both fits',()=>{
  const h=harness();
  for(const [width,height,fit] of [[1080,469,'cover'],[374,396,'contain'],[554,474,'contain']]){
    const art=h.context.rescueArtworkBounds(width,height,fit),l=h.context.rescueLayout(width,height,fit);
    assert(Math.abs(l.surface-(art.y+art.height*.47))<.01,'ledge contact follows the image');
    assert(Math.abs(l.sourceBase-(art.y+art.height*.54))<.01,'cart support follows the image');
    const source=[0,1,2,3].map(i=>h.context.rescueBookPosition(i,l,[]));
    for(const p of source){assert(p.x>=0&&p.x+l.bookWidth<=width);assert(p.y>=0&&p.y+l.bookHeight*.93<=height);}
    for(const p of [0,1,2,3].map(i=>h.context.rescueBookPosition(i,l,[0,1,2,3]))){assert(p.y>=0);assert(p.x+l.bookWidth<=width);}
    assert(l.platformTop>=0&&l.platformTop+l.platformHeight<=height);
  }
});
