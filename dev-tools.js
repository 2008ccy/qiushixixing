/* Optional developer UI. Loaded only with ?debug=1; see 开发调试说明.md. */
export function mountDeveloperTools({chapters,jump}) {
 const style=document.createElement('style');
 style.textContent=`
 #developer-tools{position:fixed;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));z-index:20;width: min(310px,calc(100vw - 16px));font:14px/1.6 system-ui,sans-serif;color:#e6dfcf;text-align:left}
 #developer-tools button,#developer-tools select{font:inherit;color:inherit;min-height:38px;border:1px solid #847557;border-radius:4px;background:#182225;padding:6px 10px;touch-action:manipulation}
 #developer-tools button:hover{background:#304044}
 #developer-tools button:focus-visible,#developer-tools select:focus-visible{outline:2px solid #d7b780;outline-offset:2px}
 #developer-tools-toggle{color:#d7b780!important;box-shadow:0 2px 12px #0006}
 #developer-tools-panel{margin-top:6px;padding:12px;background:#182225f5;border:1px solid #847557;border-radius:4px;box-shadow:0 4px 20px #0006;max-height:calc(100dvh - 72px);overflow:auto}
 #developer-tools-panel label{display:block;margin-bottom:6px}
 #developer-tools-chapter{display:block;width:100%;min-width:0}
 #developer-tools-panel p{font:12px/1.6 system-ui,sans-serif;margin:10px 0;color:#c0b9a9}
 #developer-tools-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 #developer-tools-actions a{color:#d7b780;font-size:12px}
 #developer-tools-status{display:block;margin-top:8px;font-size:12px;color:#d7b780}
 `;
 const root=document.createElement('aside');
 root.id='developer-tools';root.setAttribute('aria-label','开发者调试工具');
 const toggle=document.createElement('button');
 toggle.id='developer-tools-toggle';toggle.type='button';toggle.textContent='开发调试 ▾';
 toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','developer-tools-panel');
 const panel=document.createElement('div');panel.id='developer-tools-panel';panel.hidden=true;
 const label=document.createElement('label');label.htmlFor='developer-tools-chapter';label.textContent='从章节开头游玩';
 const select=document.createElement('select');select.id='developer-tools-chapter';
 for(const chapter of chapters){const option=document.createElement('option');option.value=chapter.id;option.textContent=chapter.label;select.append(option);}
 const note=document.createElement('p');note.textContent='使用独立调试存档。每次跳转重置本局；跳过章节只模拟通行，不补分数、选择或回顾。第二章起使用默认姓名江潮生。';
 const actions=document.createElement('div');actions.id='developer-tools-actions';
 const launch=document.createElement('button');launch.type='button';launch.id='developer-tools-jump';launch.textContent='进入 / 重玩此章';
 const exit=document.createElement('a');const normalURL=new URL(location.href);normalURL.searchParams.delete('debug');exit.href=normalURL.href;exit.textContent='退出调试';
 const status=document.createElement('span');status.id='developer-tools-status';status.setAttribute('role','status');status.textContent='调试模式 · 正式存档独立保留';
 function setExpanded(expanded){panel.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'开发调试 ▴':'开发调试 ▾';}
 toggle.addEventListener('click',()=>setExpanded(panel.hidden));
 launch.addEventListener('click',()=>{
  setExpanded(false);
  jump(select.value);
  status.textContent='已进入：'+chapters.find(chapter=>chapter.id===select.value).label;
 });
 // Keep tool navigation from triggering the story's any-key advance handler.
 root.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'&&!panel.hidden){event.preventDefault();setExpanded(false);toggle.focus();}
 });
 actions.append(launch,exit);panel.append(label,select,note,actions,status);root.append(toggle,panel);
 document.head.append(style);document.body.append(root);
}
