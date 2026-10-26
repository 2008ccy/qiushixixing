'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const engine=script('game-engine'),story=JSON.parse(script('story-data'));
const stations=vm.runInNewContext(engine.match(/const stations=([\s\S]*?\n\]);/)[1]);
const chapterNames=vm.runInNewContext(engine.match(/const chapterNames=(\[[^;]+\]);/)[1]);
function source(name){const a=engine.indexOf('function '+name+'('),b=engine.indexOf('\nfunction ',a+1);assert(a>=0,name);return engine.slice(a,b);}
function harness(index=1,pending=true){
 const elements=new Map();
 function el(tag,cls='',text=''){const e={tagName:tag.toUpperCase(),className:cls,textContent:text,children:[],attributes:{},dataset:{},style:{setProperty(k,v){this[k]=v;}},hidden:false,disabled:false,
  append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this[k]=fn;},scrollIntoView(){}};return e;}
 const $=id=>{if(!elements.has(id))elements.set(id,el('div'));return elements.get(id);};
 $('route-atlas').clientWidth=1280;$('route-atlas').clientHeight=720;
 const entry=index===7?'montage':stations[index].entry;
 const c=vm.createContext({$,el,stations,chapterNames,nodes:new Map(story.nodes.map(n=>[n.id,n])),playing:true,nameConfirmed:true,pageVersion:0,
  current:story.nodes.find(n=>n.id===entry),state:{name:'江潮生',nodeId:entry,renxin:2,xinhuo:3,qiuzhen:4,mistakes:1},
  journey:{completed:Array.from(stations.slice(0,index),s=>s.id),pending:pending?entry:null,history:[],finaleStarted:false},view:{mode:'map',nodeId:entry,phase:'node',page:0},
  document:{body:{dataset:{}}},sound:{map(){}},clearTimer(){},clearView(){c.pageVersion++;},autoSave(){c.saves++;},saves:0,
  requestAnimationFrame(fn){fn();},openJournal(){},openSaves(){},showDialog(){},openReview(i){c.reviewed=i;},
  renderCurrent(){c.rendered=c.current.id;},go(id,forced){c.entered=id;c.forced=forced;c.current=c.nodes.get(id);c.view={mode:'story',nodeId:id,phase:'node',page:0};}});
 for(const name of ['btn','chapterIndex','freshView','routeMapLayout','layoutRouteMap','drawMap','completeChapter','openMap','resumeJourney'])vm.runInContext(source(name),c);
 return {c,$,buttons:()=>$('route-stations').children};
}
test('every transition places all chapters on the map, lights only the next station and preserves the real entry',()=>{
 for(let i=1;i<7;i++){
  const h=harness(i),c=h.c,before=JSON.stringify(c.state);c.drawMap();const buttons=h.buttons();assert.equal(buttons.length,7);
  assert.equal(buttons.filter(b=>b.className.includes('current')).length,1);assert.equal(buttons[i].dataset.station,stations[i].id);
  assert.equal(buttons.filter(b=>b.disabled).length,6-i);assert.equal(buttons[i].attributes['aria-current'],'step');
  assert.match(h.$('map-prompt').textContent,/点击地图上的光亮处，开始下一章/);assert.equal(h.$('map-finish').hidden,true);
  assert.equal(JSON.stringify(c.state),before);buttons[i].click();assert.equal(c.entered,stations[i].entry);assert.equal(c.forced,true);assert.equal(c.journey.pending,null);
 }
 assert.equal(stations[2].entry,'chapter2-news');
});
test('completed stations open review, locked stations cannot advance, and midchapter map preserves the draft',()=>{
 const h=harness(3,false),c=h.c;c.view={...c.view,mode:'story',page:2,phase:'node',rescue:{started:true,remaining:8500,moved:[2]}};
 const draft=JSON.stringify(c.view.rescue),scores=JSON.stringify(c.state);c.openMap();h.buttons()[5].click();assert.equal(c.entered,undefined);
 h.buttons()[1].click();assert.equal(c.reviewed,1);assert.equal(c.view.mode,'map');assert.equal(JSON.stringify(c.state),scores);
 assert.match(h.$('map-prompt').textContent,/继续当前章节/);h.buttons()[3].click();assert.equal(c.view.mode,'story');assert.equal(c.rendered,c.current.id);
 assert.equal(c.view.page,2);assert.equal(JSON.stringify(c.view.rescue),draft);assert.equal(JSON.stringify(c.state),scores);
});
test('chapter completion opens the next map; the final map consumes its pending finale once',()=>{
 const h=harness(2,false),c=h.c;c.journey.completed=['museum','tianmu'];c.completeChapter(2,'chapter3-start');
 assert.deepEqual(Array.from(c.journey.completed),['museum','tianmu','jiande']);assert.equal(c.view.mode,'map');assert.equal(c.journey.pending,'chapter3-start');
 const f=harness(7),g=f.c;g.drawMap();assert.equal(f.buttons().every(b=>b.className.includes('completed')),true);assert.equal(f.$('map-finish').hidden,false);
 g.resumeJourney();assert.equal(g.entered,'montage');assert.equal(g.journey.finaleStarted,true);assert.equal(g.journey.pending,null);
 g.entered=null;g.resumeJourney();assert.equal(g.entered,null);assert.equal(g.rendered,'montage');
});
test('cover layout fills desktop and phone viewports, keeps the active dot visible and anchors every marker to the artwork',()=>{
 const {c}=harness();for(const [w,h] of [[1280,720],[390,844],[568,723],[844,390]])for(let i=0;i<7;i++){
  const l=c.routeMapLayout(w,h,i),p=stations[i].map;assert(l.width>=w-.01);assert(l.height>=h-.01);assert(Math.abs(l.width/l.height-1453/900)<.0001);
  const x=p.x*l.width-l.left,y=p.y*l.height-l.top;assert(x>=20&&x<=w-20,'visible x '+i);assert(y>=20&&y<=h-20,'visible y '+i);
  assert(l.left>=0&&l.left<=l.width-w+.01);assert(l.top>=0&&l.top<=l.height-h+.01);
 }
 const h=harness();h.c.drawMap();for(const [i,b] of h.buttons().entries())assert.equal(b.style['--station-x'],stations[i].map.x*100+'%');
 assert.match(html,/body\[data-type="map"\] #game\{width:100%;height:100dvh/);assert.match(html,/@media\(prefers-reduced-motion:reduce\)\{#route-map \.station.current \.station-number\{animation:none/);
});
