import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from './store';
import { addMessage, editMessage, newSession as ns, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings, setLanguage, branchSession, addMemory } from './store/chatSlice';
import type { ChatMessage, Strategy } from './store/chatSlice';
import SettingsPanel from './components/SettingsPanel';
import ImageInput from './components/ImageInput';

const T = { newChat:'新对话',placeholder:'问点什么... 拖拽文件到此处上传',welcome:'有什么我可以帮你的？',desktopHint:'我也可以控制你的桌面',analyzing:'正在分析意图…',error:'出错了: ',quality:'✦ 优质',cost:'◆ 省钱',ensemble:'◈ 协同',copied:'已复制',branch:'分支',edit:'编辑',regen:'重新生成',save:'保存',cancel:'取消',memory:'记忆',export:'导出',stop:'停止',templates:'模板',search:'联网搜索',};
const SUGS = ['帮我写一封给投资人的项目介绍邮件','解释一下量子计算的基本原理','用 Python 写一个多线程下载器','帮我分析最近压力大的原因并给出建议'];

const WinBtns: React.FC = () => (<div className="win-btns"><button onClick={()=>window.electronAPI?.minimize()} className="wb">{'─'}</button><button onClick={()=>window.electronAPI?.maximize()} className="wb">{'□'}</button><button onClick={()=>window.electronAPI?.close()} className="wb wb-close">{'✕'}</button></div>);

const SidebarView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useAppDispatch();
  const { sessions, activeSessionId, settings } = useAppSelector(s => s.chat);
  const [search, setSearch] = useState('');
  const filtered = search ? sessions.filter(x => x.name.toLowerCase().includes(search.toLowerCase())) : sessions;
  return (<div className="sidebar"><div className="sidebar-header"><div className="sb-logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2v4l3-2-3 4m0 8v4l-3-2 3-4m6-2l-2-3 4 3m-8 6l-2-3-4 3"/></svg><span>POLARIS</span></div><button onClick={onClose} className="sb-close">{'✕'}</button></div>
  <button className="new-chat-btn" onClick={()=>dispatch(ns())}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>{T.newChat}</button>
  <div className="sidebar-search"><input placeholder="搜索对话…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
  <div className="sessions">{filtered.map(s => <div key={s.id} className={'sess-item'+(s.id===activeSessionId?' active':'')} onClick={()=>dispatch(setActiveSession(s.id))}><div className="sess-dot"/><div className="sess-name">{s.name}</div></div>)}</div>
  {settings.memory.enabled && settings.memory.entries.length > 0 && <div style={{padding:8}}><div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',padding:'4px 8px'}}>{T.memory} ({settings.memory.entries.length})</div></div>}
  <div className="sidebar-foot">v0.6.0 · BitWool Studio</div></div>);
};

const MsgBubble: React.FC<{ msg: ChatMessage; isLast: boolean; onCopy: () => void; onRegen: () => void; onEdit: (v:string) => void; onBranch: () => void; copied: boolean; }> = ({ msg, isLast, onCopy, onRegen, onEdit, onBranch, copied }) => {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  if (msg.role === 'user') return (<div className="msg-row user"><div className="user-bubble">{msg.content}{msg.edited&&<span style={{fontSize:9,color:'var(--text3)',marginLeft:6}}>(已编辑)</span>}</div></div>);
  return (<div className="ai-row-wrap"><div className="msg-row"><div className="ai-actions">{isLast && <><button className="ai-act-btn" onClick={onCopy} title="复制">{copied?'✓':'⎘'}</button><button className="ai-act-btn" onClick={onRegen} title={T.regen}>↻</button><button className="ai-act-btn" onClick={onBranch} title={T.branch}>⑂</button></>}<button className="ai-act-btn" onClick={()=>{setEditing(true);setEditVal(msg.content);}} title={T.edit}>✎</button></div>
  <div className="ai-bubble">{msg.routing&&<div className="route-inline"><span className="rt-intent">{msg.routing.intent}</span><span className="rt-arrow">{'→'}</span>{msg.routing.models.map(m=><span key={m} className="rt-model">{m}</span>)}</div>}
  {editing ? (<div><textarea className="msg-edit-input" value={editVal} onChange={e=>setEditVal(e.target.value)} rows={8}/><div className="msg-edit-bar"><button onClick={()=>{onEdit(editVal);setEditing(false);}} className="msg-edit-btn">{T.save}</button><button onClick={()=>setEditing(false)} className="msg-edit-btn msg-edit-cancel">{T.cancel}</button></div></div>)
  : <div dangerouslySetInnerHTML={{__html:renderRich(msg.content)}}/>}
  {msg.model&&<div className="model-foot">{msg.model}</div>}</div></div></div>);
};

const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const { sessions, activeSessionId, streaming, strategy, sidebarOpen, settingsOpen, settings, contextTokens } = useAppSelector(s => s.chat);
  const [input, setInput] = useState(''); const [thinkText, setThinkText] = useState('');
  const [showStrats, setShowStrats] = useState(false); const chatRef = useRef<HTMLDivElement>(null);
  const [doingDesk, setDoingDesk] = useState(false); const [deskMode, setDeskMode] = useState(false); const [deskAction, setDeskAction] = useState('');
  const [ripples, setRipples] = useState<{id:number;x:number;y:number}[]>([]);
  const [pastedImage, setPastedImage] = useState<{dataUrl:string;name:string}|null>(null);
  const [copiedId, setCopiedId] = useState(''); const [showTemplates, setShowTemplates] = useState(false);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const stopRef = useRef(false); const inputRef = useRef<HTMLTextAreaElement>(null);
  const active = sessions.find(s => s.id === activeSessionId);

  useEffect(() => { document.documentElement.setAttribute('data-theme', settings.theme); }, [settings.theme]);
  useEffect(() => { dispatch(setLanguage('zh-CN')); }, [dispatch]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, thinkText, deskAction]);
  useEffect(() => { if (ripples.length > 0) { const t = setTimeout(() => setRipples([]), 700); return () => clearTimeout(t); } }, [ripples]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey||e.metaKey)&&e.key==='n') { e.preventDefault(); dispatch(ns()); } if (e.key==='Escape') { stopRef.current = true; dispatch(setStreaming(false)); setThinkText(''); } if ((e.ctrlKey||e.metaKey)&&e.key==='k') { e.preventDefault(); document.getElementById('chat-input')?.focus(); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dispatch]);

  const executeDesktopAction = useCallback(async (action: any) => {
    if (!action) return; const api = window.electronAPI!;
    switch (action.action) { case 'open_browser':if(action.url)api.desktopOpenBrowser(action.url);break;case 'click':if(action.x!==undefined&&action.y!==undefined){api.desktopClickMouse(action.x,action.y,action.button||'left');setRipples([{id:Date.now(),x:action.x,y:action.y}]);}break;case 'type':if(action.text)api.desktopTypeText(action.text);break;case 'press_key':if(action.key)api.desktopPressKey(action.key);break;case 'hotkey':if(action.combo)api.desktopHotkey(action.combo);break;case 'run_command':if(action.command)await api.desktopRunCommand(action.command);break;case 'wait':if(action.ms)await new Promise(r=>setTimeout(r,action.ms));break; }
  }, []);

  const sendQuery = useCallback(async (text: string, isRegen?: boolean) => {
    if (!text || streaming) return; stopRef.current = false;
    if (!isRegen) { setInput(''); const img = pastedImage; setPastedImage(null);
      const um: ChatMessage = { id:'u'+Date.now(), role:'user', content:text, timestamp:Date.now() };
      dispatch(addMessage({ sessionId: activeSessionId!, message:um }));
    }
    dispatch(setStreaming(true)); setThinkText(T.analyzing);
    try {
      // Web search if enabled
      let contextText = text;
      if (webSearchOn) {
        setThinkText('正在搜索网络…');
        try { const { webSearch } = await import('./utils/search'); const results = await webSearch(text, settings.apiKeys.serper); if (results.length>0 && !results[0].title.includes('未配置')) { contextText = text + '\n\n[联网搜索结果]\n' + results.map(r=>'- '+r.title+': '+r.snippet).join('\n'); } } catch {}
      }
      const img = pastedImage;
      const result = await window.electronAPI!.query({ text: contextText, strategy, images: img ? [img.dataUrl] : undefined });
      if (stopRef.current) return;
      setThinkText(T.quality + ' → ' + result.routing.selected_models.join(', ') + '…');
      const resps = result.responses||[];
      const content = resps.length===1 ? resps[0].content||'(空)' : resps.map(r=>'**▸ '+r.model_id+'**\n\n'+(r.content||'')).join('\n\n---\n\n');
      // Save to long-term memory for key facts
      if (settings.memory.enabled && content.length > 50) { const key = text.slice(0, 40); dispatch(addMemory({ key, value: content.slice(0, 200) })); }
      const am: ChatMessage = { id:'a'+Date.now(),role:'assistant',content,timestamp:Date.now(),model:result.routing.selected_models.join(', '),routing:{intent:result.routing.top_intent,models:result.routing.selected_models,rationale:result.routing.rationale} };
      dispatch(addMessage({ sessionId:activeSessionId!, message:am }));
    } catch(e:any) { if (!stopRef.current) dispatch(addMessage({ sessionId:activeSessionId!, message:{id:'e'+Date.now(),role:'assistant',content:T.error+(e.message||'未知'),timestamp:Date.now()} })); }
    dispatch(setStreaming(false)); setThinkText('');
  }, [streaming, strategy, activeSessionId, dispatch, pastedImage, webSearchOn, settings.apiKeys.serper, settings.memory.enabled, executeDesktopAction]);

  const send = useCallback(() => { const t = input.trim(); if (!t) return; sendQuery(t); }, [input, sendQuery]);
  const copyMsg = (c: string) => { navigator.clipboard.writeText(c); setCopiedId(c.slice(0,20)); setTimeout(()=>setCopiedId(''),1500); };
  const regen = () => { if (!active||active.messages.length<2) return; const lu = [...active.messages].reverse().find(m=>m.role==='user'); if (lu) sendQuery(lu.content, true); };
  const editMsg = (v: string) => { if (!active) return; const la = [...active.messages].reverse().find(m=>m.role==='assistant'); if (la) { dispatch(editMessage({sessionId:active.id,messageId:la.id,content:v})); } };
  const doBranch = () => { if (!active||active.messages.length<2) return; const lu = [...active.messages].reverse().find(m=>m.role==='user'); if (lu) dispatch(branchSession({sourceSessionId:active.id,upToMessageId:lu.id})); };
  const exportChat = () => { if (!active) return; const md = active.messages.map(m=>`### ${m.role==='user'?'用户':'AI'}\n\n${m.content}\n`).join('\n---\n\n'); const blob = new Blob([md],{type:'text/markdown'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = active.name+'.md'; a.click(); };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file&&file.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => setPastedImage({dataUrl:r.result as string,name:file.name}); r.readAsDataURL(file); } };

  const pct = contextTokens.total > 0 ? Math.min(Math.round(contextTokens.used / contextTokens.total * 100), 100) : 0;

  return (<div className="polaris-app" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
    <div className="titlebar"><div className="titlebar-left"><span className="tb-logo">{'✦ Polaris'}</span><div className="token-bar" style={{width:80,height:3,borderRadius:2,background:'var(--border)',overflow:'hidden',marginLeft:12}}><div style={{width:pct+'%',height:'100%',background:pct>80?'var(--red)':pct>50?'var(--amber)':'var(--green)',transition:'width .3s'}}/></div></div><div className="titlebar-center"/><div className="titlebar-right"><button className="tb-btn" onClick={()=>dispatch(toggleSidebar())} title="侧边栏">{'☰'}</button><button className="tb-btn" onClick={exportChat} title={T.export}>↓</button><button className="tb-btn" onClick={()=>dispatch(toggleSettings())} title="设置">{'⚙'}</button><WinBtns/></div></div>
    {dragOver && <div className="drag-overlay"><div className="drag-zone"><div className="empty-icon">{'✦'}</div><p>拖拽文件到此处上传</p></div></div>}
    {deskMode && (<div className="desk-overlay"><div className="desk-banner"><div className="desk-dot" /><span>{deskAction}</span></div></div>)}
    {ripples.map(r => <div key={r.id} className="click-ripple" style={{ left: r.x - 15, top: r.y - 15, position:'fixed', zIndex: 9999 }} />)}
    <div className="polaris-body">
      {sidebarOpen && <SidebarView onClose={()=>dispatch(toggleSidebar())}/>}
      <div className="main">
        <div className="chat" ref={chatRef}>
          {(!active||active.messages.length===0)?(<div className="empty"><div className="empty-icon">{'✦'}</div><h2>{T.welcome}</h2><p style={{color:'var(--text3)',fontSize:12,marginTop:4}}>{T.desktopHint}</p><div className="suggestions">{SUGS.map((s,i)=><div key={i} className="sug" onClick={()=>{setInput(s);send()}}>{s}</div>)}</div></div>):(
            active.messages.map((m,i) => <MsgBubble key={m.id} msg={m} isLast={i===active.messages.length-1} onCopy={()=>copyMsg(m.content)} onRegen={regen} onEdit={(v)=>editMsg(v)} onBranch={doBranch} copied={copiedId===m.content.slice(0,20)} />)
          )}
          {thinkText&&(<div className="think-msg"><div className="think-dot"/><span>{thinkText}</span></div>)}
        </div>
        {pastedImage && <div className="img-preview"><img src={pastedImage.dataUrl} alt="" style={{maxHeight:80,borderRadius:6}}/><button onClick={()=>setPastedImage(null)} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:16,padding:'0 8px'}}>{'✕'}</button></div>}
        <div className="input-area">
          {showTemplates && <div className="tpl-panel">{settings.promptTemplates.map(t=><div key={t.id} className="tpl-item" onClick={()=>{setInput(t.content);setShowTemplates(false);inputRef.current?.focus();}}><div className="tpl-name">{t.name}</div><div className="tpl-cat">{t.category}</div></div>)}</div>}
          <div className="input-row">
            <ImageInput onImage={(d,f)=>setPastedImage({dataUrl:d,name:f})} disabled={streaming||doingDesk} />
            <textarea ref={inputRef} id="chat-input" value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,150)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder={T.placeholder} rows={1} disabled={streaming||doingDesk}/>
            {streaming ? <button className="stop-btn" onClick={()=>{stopRef.current=true;dispatch(setStreaming(false));setThinkText('');}} title={T.stop}>■</button>
            : <button className="send-btn" onClick={send} disabled={!input.trim()}><svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 5.5L2 14l3-6.5L2 2z"/></svg></button>}
          </div>
          <div className="input-options">
            <div style={{display:'flex',gap:8}}>
              <div className="strat-picker" onMouseEnter={()=>setShowStrats(true)} onMouseLeave={()=>setShowStrats(false)}>
                <span className="sp-label">{{best_quality:T.quality,cost_optimized:T.cost,ensemble:T.ensemble}[strategy]}</span>
                {showStrats&&(<div className="sp-drop">{(['best_quality','cost_optimized','ensemble'] as Strategy[]).map(s=><div key={s} className={'sp-item'+(strategy===s?' sel':'')} onClick={()=>{dispatch(setStrategy(s));setShowStrats(false)}}>{{best_quality:T.quality,cost_optimized:T.cost,ensemble:T.ensemble}[s]}</div>)}</div>)}
              </div>
              <button className={'opt-chip'+(webSearchOn?' on':'')} onClick={()=>setWebSearchOn(!webSearchOn)} title={T.search}>{'🌐'} {webSearchOn?'ON':'OFF'}</button>
              <button className="opt-chip" onClick={()=>setShowTemplates(!showTemplates)} title={T.templates}>{'📋'}</button>
            </div>
            <span className="input-hint">Ctrl+N 新对话 · Esc 停止 · Ctrl+K 聚焦输入</span>
          </div>
        </div>
      </div>
    </div>
    {settingsOpen && <SettingsPanel/>}
  </div>);
};

function renderRich(t: string): string {
  let h = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Mermaid
  h = h.replace(/```mermaid\n([\s\S]*?)```/g, (_,c:string)=>'<div class="mermaid-block">'+c.trim()+'</div>');
  // Code blocks with language
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_,lang:string,c:string)=>'<pre class="code-block"><div class="code-lang">'+(lang||'text')+'</div><code>'+highlightCode(c.trim(),lang)+'</code></pre>');
  // Inline code
  h = h.replace(/`([^`]+)`/g,'<code>$1</code>');
  // Bold/italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g,'<em>$1</em>');
  // LaTeX
  h = h.replace(/\$\$(.+?)\$\$/g, (_,f:string)=>'<div class="latex-block">'+f+'</div>');
  h = h.replace(/\$(.+?)\$/g, (_,f:string)=>'<span class="latex-inline">'+f+'</span>');
  // Headings
  h = h.replace(/^### (.+)/gm,'<h3>$1</h3>'); h = h.replace(/^## (.+)/gm,'<h2>$1</h2>'); h = h.replace(/^# (.+)/gm,'<h1>$1</h1>');
  // Lists
  h = h.replace(/^[-*] (.+)/gm,'<li>$1</li>'); h = h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');
  h = h.replace(/\n\n/g,'</p><p>'); h = h.replace(/\n/g,'<br/>');
  return '<p>'+h+'</p>';
}

function highlightCode(code: string, lang: string): string {
  const kw = {js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this','null','undefined','true','false'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except','raise','with','as','None','True','False'],ts:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this','null','undefined','true','false','interface','type','extends']};
  const words = (kw as any)[lang] || [];
  let out = code;
  words.forEach(w => { out = out.replace(new RegExp('\\b'+w+'\\b','g'), '<span class="hl-kw">'+w+'</span>'); });
  out = out.replace(/(\".*?\")/g,'<span class="hl-str">$1</span>');
  out = out.replace(/(\'.*?\')/g,'<span class="hl-str">$1</span>');
  out = out.replace(/(\/\/.*)/g,'<span class="hl-cm">$1</span>');
  out = out.replace(/(\d+)/g,'<span class="hl-num">$1</span>');
  return out;
}

export default App;
