'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const story=JSON.parse(script('story-data')),audio=script('qiushi-audio');
const cues=JSON.parse(audio.match(/const cues=([\s\S]*?);\r?\n/)[1]);
const files=Object.fromEntries([...audio.match(/const files=\{([\s\S]*?)\};/)[1].matchAll(/(\w+):'([^']+)'/g)].map(([,key,path])=>[key,path]));
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
 return {api:c.QiushiAudio,enter,records,document,listeners,timers,
  music:()=>records.filter(r=>r.loop&&r.src.includes('%E8%83%8C%E6%99%AF')||r.loop&&r.src.includes('%E6%A0%A1%E6%AD%8C')),
  step(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
test('every story node has a cue and split pages inherit their source cue',()=>{
 assert.equal(Object.keys(cues).length,story.nodes.length);
 assert.deepEqual(new Set(Object.keys(cues)),new Set(story.nodes.map(n=>n.id)));
 const pageSources={'choice-3-chen-feedback-page-2':'choice-3'};
 for(const node of story.nodes){
  const source=pageSources[node.id]||node.id.replace(/-page-\d+$/,'');
  if(source!==node.id)assert.deepEqual(cues[node.id],cues[source],node.id);
 }
});
test('sirens are removed and long passages keep one coherent score',()=>{
 assert.equal(Object.values(cues).filter(c=>(c.fx||[]).includes('siren')).length,0);
 assert.equal(files.sob,'哭/小女孩抽泣声音效_爱给网_aigei_com.mp3');
 assert(fs.existsSync(path.join(__dirname,'../qiushi_bgm',files.sob)));
 const fourth=story.nodes.slice(story.nodes.findIndex(n=>n.id==='chapter4-start'),story.nodes.findIndex(n=>n.id==='scene-091'));
 for(const node of fourth)assert.deepEqual(cues[node.id],node.id==='chapter4-start'?{music:'history',volume:.18,fx:['cannon']}:{music:'history',volume:.18},node.id);
 assert.deepEqual(cues['scene-091'],{music:'anthem',volume:.28});
 for(const id of ['scene-092','scene-093','scene-094','choice-4'])assert.deepEqual(cues[id],id==='scene-092'?{music:'tragic',volume:.18,bombing:true}:{music:'tragic',volume:.18},id);
 assert.equal(cues['scene-092'].bombing,true);
 for(const id of ['scene-098','scene-098-page-2','interaction-9','scene-100','scene-101','scene-102','scene-103','scene-104','scene-105','interaction-10'])assert.deepEqual(cues[id],{music:'piano',volume:.18},id);
 for(const id of ['scene-107','scene-108'])assert.deepEqual(cues[id],{music:'piano',volume:.22},id);
 for(const id of ['scene-109','scene-110','scene-110-page-2'])assert.deepEqual(cues[id],{music:'inspire',volume:.24},id);
 for(const id of ['chapter6-start','interaction-11','scene-127','scene-127-page-2','montage','ending','audit-farewell-chase','scene-130','scene-131'])assert.deepEqual(cues[id],{music:'anthem',volume:.3},id);
 assert.equal(story.endings.qiushi.title,'结局 · 求是');
});
test('rain stays beneath music and victory audio avoids page-level spikes',()=>{
 for(const id of ['protect-rain','interaction-7'])assert.deepEqual(cues[id],{music:'books',volume:.18,ambient:'rain',ambientVolume:.05},id);
 for(const id of ['scene-111','scene-112','audit-fei-future-memory','choice-5','fei-stop','fei-silent','audit-fei-lift-case','audit-fei-silent-reply'])assert.deepEqual(cues[id],{music:'piano',volume:.18,ambient:'rain',ambientVolume:.04},id);
 for(const id of ['fei-gone','fei-gone-page-2'])assert.deepEqual(cues[id],{music:null,volume:.2,ambient:'rain',ambientVolume:.08},id);
 for(const id of ['scene-117','scene-118','scene-119'])assert.deepEqual(cues[id],{music:'inspire',volume:.26,ambient:'fireworks',ambientVolume:.08},id);
 for(const id of ['scene-120','scene-121','scene-122','scene-123','scene-123-page-2'])assert.deepEqual(cues[id],{music:'inspire',volume:.24,ambient:'fireworks',ambientVolume:.05},id);
 assert.deepEqual(cues['scene-124'],{music:'inspire',volume:.22,fx:['shutter']});
});
test('audio engine follows smoothed cues without sirens',()=>{
 const h=harness();h.enter('scene-020');let books=h.music().at(-1);
 assert.equal(books.gain.value,.22);h.enter('scene-021');assert.equal(h.music().at(-1),books);
 h.enter('chapter2-news');const cinema=h.music().at(-1);
 assert.equal(cinema.gain.value,.22);
 assert(h.records.some(r=>r.src.includes('cannon-shot')));
 assert.equal(h.records.some(r=>r.src.includes('air-raid-siren')),false);
 h.enter('protect-rain');books=h.music().at(-1);
 assert.equal(books.gain.value,.18);
 assert.equal(h.records.find(r=>r.src.includes('rain-sound')).gain.value,.05);
});
test('three-second crossfades stay bounded, and background/mute still pause and resume sound',()=>{
 const h=harness();h.enter('scene-044');const piano=h.music().at(-1);assert.equal(piano.gain.duration,3);
 h.enter('chapter3-start');const inspire=h.music().at(-1);assert.equal(piano.gain.value,0);assert.equal(inspire.gain.duration,3);
 h.enter('chapter4-start');assert.equal(piano.paused,true); // rapid switching disposes the oldest overlap
 h.step(4000);assert.equal(h.music().at(-1).paused,false);
 const current=h.music().at(-1);h.document.hidden=true;h.listeners.visibilitychange();assert.equal(current.paused,true);
 h.document.hidden=false;h.listeners.visibilitychange();assert.equal(current.paused,false);assert.equal(h.music().at(-1),current);
});
