'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),engine=html.match(/id="game-engine">([\s\S]*?)<\/script>/)[1];
const story=JSON.parse(html.match(/id="story-data">([\s\S]*?)<\/script>/)[1]);
function source(name){const start=engine.indexOf('function '+name+'('),end=engine.indexOf('\nfunction ',start+1);return engine.slice(start,end);}
function harness(width,size){
 const context={font:'',measureText(value){return {width:Array.from(value).reduce((n,ch)=>n+(/[\x00-\x7f]/.test(ch)?size/2:size),0)};}};
 const c=vm.createContext({window:{innerWidth:width},content:{clientWidth:width},storyMetrics:()=>({char:size,line:size*1.6}),
  getComputedStyle:()=>({fontStyle:'normal',fontWeight:'400',fontSize:size+'px',fontFamily:'SimSun',letterSpacing:'0px'}),document:{createElement:()=>({getContext:()=>context})}});
 vm.runInContext(source('latinLineMeasure')+'\n'+source('textPages'),c);return {c,context};
}
test('the English quotation stays on one desktop line when its actual glyph widths fit',()=>{
 const h=harness(1000,22),node=story.nodes.find(n=>n.id==='scene-110-page-2'),quote=node.text.split('\n')[0];
 const pages=h.c.textPages(node.text,22*1.6*3,{});assert.equal(pages.length,1);assert.equal(pages[0].split('\n')[0],quote);assert.equal(pages[0].includes('in\nChina'),false);assert.equal(h.context.font,'normal 400 22px SimSun');
});
test('narrow screens wrap the quote while keeping complete text and using the available visual lines',()=>{
 const h=harness(330,20),node=story.nodes.find(n=>n.id==='scene-110-page-2'),pages=h.c.textPages(node.text,20*1.6*4,{});
 assert.equal(pages.length,1);const lines=pages[0].split('\n');assert.equal(lines.length,4);
 for(const line of lines)assert(h.context.measureText(line).width<=330);
 assert.equal(pages.join('').replace(/\s/g,''),node.text.replace(/\s/g,''));
});
test('Chinese-only pagination retains its existing line and page limits',()=>{
 const h=harness(200,20),value='甲'.repeat(45),pages=h.c.textPages(value,20*1.6*2,{});
 assert.equal(pages.length,3);assert.equal(pages[0].split('\n').length,2);assert.equal(pages.join('').replace(/\n/g,''),value);
});
