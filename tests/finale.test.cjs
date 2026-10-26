'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const engine=script('game-engine'),story=JSON.parse(script('story-data'));
function source(name){const start=engine.indexOf('function '+name+'('),end=engine.indexOf('\nfunction ',start+1);assert(start>=0,name);return engine.slice(start,end<0?undefined:end);}
function harness(){
 const elements=new Map(),frames=new Map(),intervals=new Map();let serial=0,now=0,reduced=false,audio,dialog=false;
 class Element{
  constructor(tag,cls='',text=''){this.tag=tag;this.className=cls;this.textContent=text;this.children=[];this.style={};this.dataset={};this.clientHeight=400;this.hidden=false;}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}focus(){this.focused=true;}
  setAttribute(){}addEventListener(){}
  get scrollHeight(){return this.children.filter(c=>!c.hidden).length*75;}
  get offsetHeight(){return 75;}
 }
 const el=(...args)=>new Element(...args),$=id=>{if(!elements.has(id))elements.set(id,el('div'));return elements.get(id);};
 const c=vm.createContext({$,el,btn(label,fn){const b=el('button','',label);b.click=fn;return b;},document:{body:{dataset:{}},hidden:false,querySelector:()=>dialog?{}:null},finaleClock:null,studyClock:null,playing:true,
  sound:{finaleStart(d){audio={...d,duration:146,finished:d.phase!=='lyrics'};},finaleTick(){return audio;},finalePause(v){audio.paused=v;},finaleFinish(){audio.finished=true;}},
  matchMedia:()=>({matches:reduced}),performance:{now:()=>now},requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id){frames.delete(id);},
  setInterval(fn){intervals.set(++serial,fn);return serial;},clearInterval(id){intervals.delete(id);},
  clearTyping(){},advanceAction(){},autoSave(){},renderCurrent(){c.hideFinale();},openJournal(){c.journalOpened=true;},showDialog(id){c.dialogOpened=id;},
  controls:$('controls'),content:$('content'),clearTimer(){},writeText(){},typeBody(){},
  story,nodes:new Map(story.nodes.map(n=>[n.id,n])),stations:['museum','tianmu','jiande','taihe','yishan','meitan','home'].map(id=>({id})),SAVE_VERSION:1,
  journey:{completed:[],pending:null,finaleStarted:true,history:[]},nameConfirmed:true,
 });
 vm.runInContext(script('game-core'),c);c.state=c.QiushiCore.createInitialState();c.state.nodeId='reflection';
 c.view={nodeId:'reflection',mode:'story',phase:'node',page:0,reflection:['求真','做有担当的人'],finale:{phase:'lyrics',time:0,paused:false}};
 vm.runInContext(engine.match(/const finaleLyrics=\[[\s\S]*?\];/)[0],c);
 vm.runInContext(engine.match(/const finaleLineStarts=\[[\s\S]*?\];/)[0],c);
 for(const name of ['stopStudyClock','studyCanRun','updateStudyClock','startStudyWait','hideFinale','finaleLinePosition','showFinale','syncReflectionJournal','validSave','saveSnapshot'])vm.runInContext(source(name),c);
 const flatten=e=>[e,...e.children.flatMap(flatten)];
 return {c,$,frames,intervals,find:label=>flatten($('finale')).find(e=>e.tag==='button'&&e.textContent===label),
  step(time,finished=false){audio.time=time;audio.finished=finished;now+=100;for(const [id,fn] of [...frames]){frames.delete(id);fn(now);}},
  advance(ms){now+=ms;for(const fn of [...intervals.values()])fn();},setDialog(value){dialog=value;c.updateStudyClock();},
  reduced(){reduced=true;},text:()=>flatten($('finale')).map(e=>e.textContent).join('\n')};
}
test('lyrics follow audio progress and end on persistent credits without changing answers or scores',()=>{
 const h=harness(),before=JSON.stringify(h.c.state);h.c.showFinale();const track=h.$('finale').children.find(e=>e.className==='finale-window').children[0];
 h.step(0);const first=track.style.transform;h.step(65);assert.notEqual(track.style.transform,first);assert.equal(h.c.view.finale.time,65);
 h.find('暂停').click();assert.equal(h.c.view.finale.paused,true);h.find('继续播放').click();assert.equal(h.c.view.finale.paused,false);
 h.step(146,true);assert.equal(h.c.view.finale.phase,'credits');assert.equal(h.frames.size,0);
 for(const name of ['大学生思想文化素养','祝99组','周子暖','丁乐倩','汪安琪','李俊宸','张紫岩','陈长逸','黄业翔','张维濂','屈之彧','老师','王君','助教','李婉茹','AI 辅助'])assert(h.text().includes(name),name);
 assert.equal(JSON.stringify(h.c.state),before);assert.equal(h.c.view.reflection[0],'求真');
 h.find('回到两问').click();assert.equal(h.c.view.finale,undefined);assert.equal(h.$('finale').hidden,true);assert.equal(h.$('story-panel').inert,false);
});
test('all 18 recorded lyric entrances cross the center on time with smooth monotone motion',()=>{
 const h=harness(),times=[22,28,34,41,47,54,61,67,73,76,80,84,91,96,103,109,115,123];h.c.showFinale();
 const window=h.$('finale').children.find(e=>e.className==='finale-window'),track=window.children[0];
 for(const [i,t] of times.entries()){
  assert(Math.abs(h.c.finaleLinePosition(t)-i)<1e-9);h.step(t);const y=Number(track.style.transform.match(/translateY\(([-.\d]+)px/)[1]);assert(Math.abs(y+(i+.5)*75-window.clientHeight/2)<1e-8);
  const dt=.001,left=(h.c.finaleLinePosition(t)-h.c.finaleLinePosition(t-dt))/dt,right=(h.c.finaleLinePosition(t+dt)-h.c.finaleLinePosition(t))/dt;assert(Math.abs(left-right)<.0002);
 }
 let previous=-1.5;for(let t=0;t<=147;t+=.02){const next=h.c.finaleLinePosition(t);assert(next>=previous-1e-9);previous=next;}
 h.step(0);assert.equal(window.style.opacity,'0');h.step(16);assert.equal(window.style.opacity,'1');
});
test('credits list the leader once, group the other members in pinyin order, and keep both instructors together',()=>{
 const h=harness();h.c.view.finale.phase='credits';h.c.showFinale();const credits=h.$('finale').children.find(e=>e.className==='finale-credits'),team=credits.children.find(e=>e.className==='finale-team');
 assert.deepEqual(team.children[1].children.map(e=>e.textContent),['周子暖']);
 assert.deepEqual(team.children[3].children.map(e=>e.textContent),['陈长逸','丁乐倩','黄业翔','李俊宸','屈之彧','汪安琪','张维濂','张紫岩']);
 assert.equal(h.text().split('周子暖').length-1,1);assert(h.text().includes('成员按姓名拼音排序'));
 assert.deepEqual(credits.children.find(e=>e.className==='finale-guidance').children.map(e=>e.textContent),['老师：王君','助教：李婉茹']);
});
test('credits continue to a saved title page with journal, replay, reflection and restart options',()=>{
 const h=harness(),before=JSON.stringify(h.c.state);h.c.view.finale={phase:'credits',time:146,paused:true};h.c.showFinale();h.find('继续 →').click();
 assert.equal(h.c.view.finale.phase,'closing');assert(h.text().includes('求是西行：1937'));assert.equal(h.frames.size,0);assert(h.c.validSave(h.c.saveSnapshot()));
 h.find('翻看手账').click();assert(h.c.journalOpened);h.find('重新启程').click();assert.equal(h.c.dialogOpened,'restart-dialog');
 h.c.hideFinale();h.c.showFinale();assert(h.text().includes('求是西行：1937'));assert.equal(JSON.stringify(h.c.state),before);
 h.find('重听校歌').click();assert.equal(h.c.view.finale.phase,'lyrics');assert.equal(h.c.view.finale.time,0);
});
test('reflection places replay first and the anthem at the rightmost position, retaining answers',()=>{
 const h=harness();delete h.c.view.finale;const start=engine.indexOf('function showReflection('),end=engine.indexOf('// Lyrics:',start);
 vm.runInContext(engine.slice(start,end),h.c);h.c.showReflection(h.c.nodes.get('reflection'));
 assert.deepEqual(h.$('controls').children.map(b=>b.textContent),['重新启程','翻开这一程的手账','听校歌，走完这一程']);
 h.$('controls').children.at(-1).click();assert.equal(h.c.view.finale.phase,'lyrics');assert.equal(h.c.view.reflection[0],'求真');assert.equal(h.c.state.journal.length,1);
});
test('replay cancels the credits countdown, starts at zero, and reduced motion shows three static lines',()=>{
 const h=harness();h.c.view.finale={phase:'credits',time:146,paused:true};h.c.showFinale();assert.equal(h.frames.size,0);
 h.find('重听校歌').click();assert.equal(h.c.view.finale.time,0);assert.equal(h.c.view.finale.phase,'lyrics');
 assert.equal(h.intervals.size,0);
 h.reduced();h.step(75);const track=h.$('finale').children.find(e=>e.className==='finale-window').children[0];assert.equal(track.children.filter(e=>!e.hidden).length,3);
 h.find('查看制作名单').click();assert.equal(h.frames.size,0);assert.equal(h.c.view.finale.phase,'credits');
});
test('credits advance after eight visible seconds, pause in dialogs and background, and restore remaining time',()=>{
 const h=harness(),before=JSON.stringify(h.c.state);h.c.view.finale={phase:'credits',time:146,paused:true};h.c.showFinale();
 h.advance(3000);assert.equal(h.c.view.finale.wait,5000);h.setDialog(true);h.advance(60000);assert.equal(h.c.view.finale.wait,5000);h.setDialog(false);
 h.c.document.hidden=true;h.c.updateStudyClock();h.advance(60000);assert.equal(h.c.view.finale.wait,5000);h.c.document.hidden=false;h.c.updateStudyClock();
 const saved=JSON.parse(JSON.stringify(h.c.saveSnapshot()));assert(h.c.validSave(saved));h.c.hideFinale();assert.equal(h.intervals.size,0);
 h.c.view=saved.view;h.c.showFinale();h.advance(4999);assert.equal(h.c.view.finale.phase,'credits');h.advance(1);
 assert.equal(h.c.view.finale.phase,'closing');assert.equal(h.c.view.finale.wait,undefined);assert.equal(h.intervals.size,0);assert.equal(JSON.stringify(h.c.state),before);
});
test('v1 finale drafts validate only on reflection and retain both answers and the journal once',()=>{
 const h=harness();h.c.syncReflectionJournal();h.c.syncReflectionJournal();assert.equal(h.c.state.journal.length,1);
 assert(h.c.validSave(h.c.saveSnapshot()));delete h.c.view.finale;assert(h.c.validSave(h.c.saveSnapshot()));
 for(const draft of [null,{}, {phase:'lyrics',time:-1,paused:false},{phase:'other',time:0,paused:false},{phase:'lyrics',time:0,paused:'yes'},{phase:'credits',time:3601,paused:true},{phase:'credits',time:146,paused:true,wait:8001},{phase:'credits',time:146,paused:true,wait:-1},{phase:'lyrics',time:0,paused:false,wait:8000}]){
  const s=JSON.parse(JSON.stringify(h.c.saveSnapshot()));s.view.finale=draft;assert.equal(h.c.validSave(s),false);
 }
 const s=JSON.parse(JSON.stringify(h.c.saveSnapshot()));s.state.nodeId=s.view.nodeId='scene-140';s.view.finale={phase:'lyrics',time:4,paused:false};assert.equal(h.c.validSave(s),false);
});
