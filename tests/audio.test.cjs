'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const story=JSON.parse(script('story-data')),audio=script('qiushi-audio');
function harness(){
 const elements=new Map(),listeners={},records=[],timers=new Map();let serial=0,now=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{addEventListener(){},setAttribute(){}});return elements.get(id);};
 class Audio{
  constructor(){this.paused=true;this.events={};records.push(this);}
  addEventListener(name,fn){this.events[name]=fn;}
  play(){this.paused=false;this.plays=(this.plays||0)+1;return Promise.resolve();}
  pause(){this.paused=true;}
  removeAttribute(){this.src='';}
  load(){}
 }
 class AudioContext{
  constructor(){this.currentTime=0;this.state='running';}
  resume(){return Promise.resolve();}
  createGain(){const gain={value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v,time){this.value=v;this.duration=time;}};return {gain,connect(){},disconnect(){}};}
  createMediaElementSource(media){return {connect(g){media.gain=g.gain;},disconnect(){}};}
 }
 const document={hidden:false,getElementById:element,addEventListener(name,fn){listeners[name]=fn;}};
 const c=vm.createContext({document,window:{AudioContext,addEventListener(){}},Audio,location:{protocol:'http:'},localStorage:{getItem:()=>null,setItem(){}},console,
  setTimeout(fn,ms){timers.set(++serial,{fn,at:now+ms});return serial;},clearTimeout(id){timers.delete(id);},cancelAnimationFrame(){},performance:{now:()=>now}});
 vm.runInContext(audio,c);listeners.keydown({type:'keydown',key:'Enter'});
 const enter=(id,ending='qiushi')=>c.QiushiAudio.enter({id},{ending,lampLit:false});
 return {api:c.QiushiAudio,enter,records,document,listeners,timers,music:()=>records.filter(r=>r.loop&&r.src.includes('%E8%83%8C%E6%99%AF')||r.loop&&r.src.includes('%E6%A0%A1%E6%AD%8C')),
  step(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
test('chapter boundaries and Meicheng/army scenes retain their score without sirens or book effects',()=>{
 const h=harness();h.enter('scene-020');const piano=h.music().at(-1);h.enter('scene-021');h.api.map();h.enter('chapter2-news');h.enter('chapter2-start');h.enter('chapter2-start-page-2');h.enter('scene-041');
 assert.equal(h.music().at(-1),piano);assert.equal(piano.paused,false);assert.equal(piano.gain.value,.2);
 h.enter('scene-044');const books=h.music().at(-1);
 for(const id of ['scene-048','scene-049','scene-049-page-2','scene-050','scene-050-page-2','choice-2','choice2-join-reply','choice2-join-departure-page-2','scene-055']){h.enter(id);assert.equal(h.music().at(-1),books);assert.equal(books.paused,false);}
 assert.equal(books.gain.value,.16);assert.equal(h.records.some(r=>/siren|turn-a-page|camera-shutter/.test(r.src)),false);
 assert.match(script('game-engine'),/function apply\([^\n]+if\(changed&&journal\)\{notice\.textContent=/);
});
test('levee, rain rescue and Fei farewell keep music audible above subdued rain',()=>{
 const h=harness();h.enter('scene-057');const piano=h.music().at(-1);
 for(const id of ['interaction-5','scene-059','scene-059-page-2','scene-061-page-2','interaction-6','scene-064','scene-065','scene-072','protect-rain','interaction-7','scene-077']){h.enter(id);assert.equal(h.music().at(-1),piano);}
 const rescueRain=h.records.find(r=>r.src.includes('rain-sound'));assert.equal(rescueRain.gain.value,0); // faded away after leaving the rainy road
 h.enter('protect-rain');assert.equal(h.records.at(-1).gain.value,.05);assert.equal(piano.gain.value,.18);
 h.enter('scene-111');const farewell=h.music().at(-1);
 for(const id of ['scene-112','choice-5','fei-stop','fei-silent','audit-fei-lift-case','audit-fei-silent-reply','fei-gone','fei-gone-page-2']){h.enter(id);assert.equal(h.music().at(-1),farewell);}
 assert.equal(farewell.gain.value,.18);assert.equal(h.records.at(-1).gain.value,.04);
});
test('fourth chapter has one opening score; bombing and all its pages cannot stop later music',()=>{
 const h=harness();h.enter('chapter4-start');const history=h.music().at(-1);
 for(const n of story.nodes.slice(story.nodes.findIndex(n=>n.id==='chapter4-start'),story.nodes.findIndex(n=>n.id==='scene-091'))){h.enter(n.id);assert.equal(h.music().at(-1),history);}
 h.enter('scene-091');const anthem=h.music().at(-1);
 h.enter('scene-092');h.api.page({id:'scene-092'},1,2);h.step(10000);
 for(const id of ['scene-093','scene-094','choice-4','chapter5-start','audit-guizhou-hezhi','scene-097']){h.enter(id);assert.equal(h.music().at(-1),anthem);assert.equal(anthem.paused,false);}
 assert.equal(anthem.gain.value,.26);assert.equal(h.records.some(r=>/siren|cannon/.test(r.src)),false);
});
test('all five endings, finale map, montage and timeline share the same anthem until time travel',()=>{
 for(const ending of ['anonymous','qiushi','library','chengjiang','lamp']){
  const h=harness();h.enter('chapter6-start',ending);const anthem=h.music().at(-1);
  h.enter('scene-127-page-2',ending);h.api.map();h.enter('montage',ending);
  for(let i=0;i<5;i++)h.api.montage(i,ending);
  for(const id of ['ending','audit-farewell-chase','scene-130','scene-131','scene-132','scene-133','scene-134','scene-135','scene-136']){h.enter(id,ending);assert.equal(h.music().at(-1),anthem);}
  assert.equal(h.music().length,1);assert.equal(h.records.length,1);assert.equal(anthem.defaultPlaybackRate,1);assert.equal(anthem.gain.value,.3);
  h.enter('scene-137',ending);assert.equal(anthem.paused,true);
 }
 assert.equal(story.endings.qiushi.title,'结局 · 求是');
});
test('three-second crossfades stay bounded, and background/mute still pause and resume sound',()=>{
 const h=harness();h.enter('scene-044');const books=h.music().at(-1);assert.equal(books.gain.duration,3);
 h.enter('chapter3-start');const piano=h.music().at(-1);assert.equal(books.gain.value,0);assert.equal(piano.gain.duration,3);
 h.enter('chapter4-start');assert.equal(books.paused,true); // rapid switching disposes older overlap
 h.step(4000);assert.equal(piano.paused,true);
 const current=h.music().at(-1);h.document.hidden=true;h.listeners.visibilitychange();assert.equal(current.paused,true);
 h.document.hidden=false;h.listeners.visibilitychange();assert.equal(current.paused,false);assert.equal(h.music().at(-1),current);
});
