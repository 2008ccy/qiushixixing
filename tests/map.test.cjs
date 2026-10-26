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
 function el(tag,cls='',text=''){const e={tagName:tag.toUpperCase(),className:cls,textContent:text,children:[],attributes:{},dataset:{},style:{setProperty(k,v){this[k]=v;}},hidden:false,disabled:false,classList:{toggle(){},contains(k){return e.className.split(' ').includes(k);}},getBoundingClientRect(){return this.rect||{top:0,bottom:80};},querySelector(k){return k==='.map-footer'?$('map-footer'):$('map-heading');},
  append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this[k]=fn;},scrollIntoView(){}};return e;}
 const $=id=>{if(!elements.has(id))elements.set(id,el('div'));return elements.get(id);};
 $('route-atlas').clientWidth=1280;$('route-atlas').clientHeight=720;$('map-footer').rect={top:600,bottom:720};
 const entry=index===7?'montage':stations[index].entry;
 const c=vm.createContext({$,el,stations,chapterNames,nodes:new Map(story.nodes.map(n=>[n.id,n])),playing:true,nameConfirmed:true,pageVersion:0,
  current:story.nodes.find(n=>n.id===entry),state:{name:'江潮生',nodeId:entry,renxin:2,xinhuo:3,qiuzhen:4,mistakes:1},
  journey:{completed:Array.from(stations.slice(0,index),s=>s.id),pending:pending?entry:null,history:[],finaleStarted:false},view:{mode:'map',nodeId:entry,phase:'node',page:0},
  document:{body:{dataset:{}},querySelector(){return $('audio-dock');},createElementNS(ns,tag){return el(tag);}},sound:{map(){}},clearTimer(){},clearView(){c.pageVersion++;},autoSave(){c.saves++;},saves:0,
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
test('all map labels and pins fit the reserved viewport without overlapping across phones, tablets and computers',()=>{
 const {c}=harness();const overlap=(a,b)=>a.x<b.x+b.width-.1&&a.x+a.width>b.x+.1&&a.y<b.y+b.height-.1&&a.y+a.height>b.y+.1;
 for(const [w,h] of [[1280,720],[1920,1080],[1024,768],[390,844],[320,568],[360,640],[375,667],[568,723],[768,1024],[844,390],[667,375],[568,320]])for(let index=0;index<7;index++){
  const l=c.routeMapLayout(w,h,index),bounds={x:0,y:h<500&&w/h>=1.3?64:w<=600?128:96,width:w,height:h-(h<=640?60:120)};
  assert(Math.abs(l.image.width/l.image.height-1453/900)<.0001);assert(l.image.width>0&&l.image.height>0);
  for(let i=0;i<7;i++){
   const card=l.cards[i],p=l.points[i],pin={x:p.x-l.pinSize/2,y:p.y-l.pinSize/2,width:l.pinSize,height:l.pinSize};
   assert(card.x>=0&&card.x+card.width<=w+.1);assert(card.y>=bounds.y-.1&&card.y+card.height<=bounds.height+.1,`card ${i} within ${w}x${h}`);
   for(let j=0;j<7;j++){assert(!overlap(pin,l.cards[j]),`pin ${i} vs label ${j}`);if(j!==i)assert(!overlap(card,l.cards[j]),`label ${i}/${j} at ${w}x${h}`);}
   for(let j=0;j<i;j++)assert(Math.hypot(p.x-l.points[j].x,p.y-l.points[j].y)>l.pinSize);
  }
 }
 assert.match(html,/body\[data-type="map"\] #game\{width:100%;height:100dvh/);assert.match(html,/@media\(prefers-reduced-motion:reduce\)\{#route-map \.station.current \.station-number\{animation:none/);
});
test('layout measures header and footer rather than scrolling a clipped active station into view',()=>{
 const h=harness();h.c.drawMap();assert.equal(h.$('route-atlas').scrollLeft,0);assert.equal(h.$('route-atlas').scrollTop,0);
 assert.equal(h.$('route-connectors').children.length,7);for(const b of h.buttons()){assert.match(b.style['--station-x'],/px$/);assert.match(b.style['--label-x'],/px$/);}
 h.$('map-footer').rect={top:530,bottom:720};h.c.layoutRouteMap();const l=h.c.routeMapLayout(1280,720,1,{top:94,bottom:516});
 assert.equal(h.$('route-background').style.height,l.image.height+'px');
});
test('a short final-map viewport switches to fewer label rows when its footer needs more space',()=>{
 const {c}=harness(),l=c.routeMapLayout(568,320,6,{top:70,bottom:220});assert.equal(l.columns,false);
 assert(l.image.height>0);for(const card of l.cards){assert(card.y>=70);assert(card.y+card.height<=220+.1);}
});
test('only pending chapter transitions use the clean map; midchapter and story/review map paths retain the original artwork',()=>{
 const transition=harness(1);transition.c.drawMap();assert.equal(transition.$('route-background').src,'./assets/props/chapter-route-clean.webp');
 assert.equal(transition.$('route-map').style['--route-art'],'url("./assets/props/chapter-route-clean.webp")');
 const pause=harness(1,false);pause.c.drawMap();assert.equal(pause.$('route-background').src,'./assets/images/IMG-22.webp');
 assert.equal(pause.$('route-map').style['--route-art'],'url("./assets/images/IMG-22.webp")');
 vm.runInContext(source('sceneImagePath'),pause.c);
 for(const id of ['scene-004','scene-005'])assert.equal(pause.c.sceneImagePath(pause.c.nodes.get(id),'IMG-22'),'./assets/images/IMG-22.webp');
 assert.equal(pause.c.sceneImagePath({id:'montage'},'IMG-24'),'./assets/images/IMG-24.webp');
});
