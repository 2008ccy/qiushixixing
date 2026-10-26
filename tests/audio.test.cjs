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
test('key scene cues retain the music branch mapping after the dev storyline merge',()=>{
 assert.equal(files.sob,'哭/小女孩抽泣声音效_爱给网_aigei_com.mp3');
 assert(fs.existsSync(path.join(__dirname,'../qiushi_bgm',files.sob)));
 assert.deepEqual(cues['scene-010'],{music:'books',volume:.22});
 assert.deepEqual(cues['scene-020'],{music:'books',volume:.22,fx:['cannon']});
 assert.deepEqual(cues['chapter2-news'],{music:'cinema',volume:.22,fx:['cannon','siren']});
 assert.deepEqual(cues['scene-025'],{music:'piano',volume:.2,ambient:'sob',ambientVolume:.08});
 assert.deepEqual(cues['chapter4-start'],{music:'cinema',volume:.2,fx:['cannon','siren']});
 assert.deepEqual(cues['chapter6-start'],{music:'anthem',volume:.45});
 assert.deepEqual(cues['montage'],{music:'piano',volume:.6});
 assert.deepEqual(cues['scene-132'],{music:'history',volume:.2,fx:['page']});
 assert.deepEqual(cues['reflection'],{music:'anthem',volume:.8});
 assert.equal(story.endings.qiushi.title,'结局 · 求是');
});
test('audio engine follows merged cues for music, effects and ambience',()=>{
 const h=harness();h.enter('scene-020');let books=h.music().at(-1);
 assert.equal(books.gain.value,.22);h.enter('scene-021');assert.equal(h.music().at(-1),books);
 h.enter('chapter2-news');const cinema=h.music().at(-1);
 assert.equal(cinema.gain.value,.22);
 assert(h.records.some(r=>r.src.includes('cannon-shot')));
 assert(h.records.some(r=>r.src.includes('air-raid-siren')));
 h.enter('protect-rain');books=h.music().at(-1);
 assert.equal(books.gain.value,.05);
 assert.equal(h.records.find(r=>r.src.includes('rain-sound')).gain.value,.25);
});
test('three-second crossfades stay bounded, and background/mute still pause and resume sound',()=>{
 const h=harness();h.enter('scene-044');const piano=h.music().at(-1);assert.equal(piano.gain.duration,3);
 h.enter('chapter3-start');const inspire=h.music().at(-1);assert.equal(piano.gain.value,0);assert.equal(inspire.gain.duration,3);
 h.enter('chapter4-start');assert.equal(piano.paused,true); // rapid switching disposes the oldest overlap
 h.step(4000);assert.equal(h.music().at(-1).paused,false);
 const current=h.music().at(-1);h.document.hidden=true;h.listeners.visibilitychange();assert.equal(current.paused,true);
 h.document.hidden=false;h.listeners.visibilitychange();assert.equal(current.paused,false);assert.equal(h.music().at(-1),current);
});
