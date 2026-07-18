import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from './store';
import { addMessage, editMessage, newSession as ns, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings, setLanguage, branchSession, addMemory, deleteSession } from './store/chatSlice';
import type { ChatMessage, Strategy, ChatSession } from './store/chatSlice';
import SettingsPanel from './components/SettingsPanel'; import ImageInput from './components/ImageInput';
import AgentDashboard from './components/AgentDashboard'; import TaskScheduler from './components/TaskScheduler';
import { saveSessions, loadSessions, loadSettings } from './store/persist';

const T = { newChat:'新对话',welcome:'有什么我可以帮你的？',quality:'✦ 优质',cost:'◆ 省钱',ensemble:'◈ 协同',memory:'记忆',export:'导出',stop:'停止',templates:'模板',search:'联网搜索',voice:'语音',};
const SUGS = ['帮我写一封给投资人的项目介绍邮件','解释一下量子计算的基本原理','用 Python 写一个多线程下载器'];

const WinBtns: React.FC = () => (<div className="win-btns"><button onClick={()=>window.electronAPI?.minimize()} className="wb">{'─'}</button><button onClick={()=>window.electronAPI?.maximize()} className="wb">{'□'}</button><button onClick={()=>window.electronAPI?.close()} className="wb wb-close">{'✕'}</button></div>);

const SidebarView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const d = useAppDispatch(); const { sessions, activeSessionId, settings } = useAppSelector(s => s.chat);
  const [search, setSearch] = useState(''); const filtered = search ? sessions.filter(x => x.name.toLowerCase().includes(search.toLowerCase())) : sessions;
  return (<div className="sidebar"><div className="sidebar-header"><div className="sb-logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2v4l3-2-3 4m0 8v4l-3-2 3-4m6-2l-2-3 4 3m-8 6l-2-3-4 3"/></svg><span>POLARIS</span></div><button onClick={onClose} className="sb-close">{'✕'}</button></div>
  <button className="new-chat-btn" onClick={()=>d(ns())}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>{T.newChat}</button>
  <div className="sidebar-search"><input placeholder="搜索对话…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
  <div className="sessions">{filtered.map(s => <div key={s.id} className={'sess-item'+(s.id===activeSessionId?' active':'')} onClick={()=>d(setActiveSession(s.id))}><div className="sess-dot"/><div className="sess-name">{s.name}</div><button className="sess-delete" onClick={e=>{e.stopPropagation();d(deleteSession(s.id));}}>×</button></div>)}</div>
  <div className="sidebar-foot">v0.7.0 · BitWool Studio</div></div>);
};

const MsgBubble: React.FC<{ msg: ChatMessage; isLast: boolean; onCopy: () => void; onRegen: () => void; onEdit: (v:string) => void; onBranch: () => void; copied: boolean }> = ({ msg, isLast, onCopy, onRegen, onEdit, onBranch, copied }) => {
  const [editing, setEditing] = useState(false); const [editVal, setEditVal] = useState(msg.content);
  if (msg.role === 'user') return (<div className="msg-row user"><div className="user-bubble">{msg.content}{msg.edited&&<span className="msg-edited">(已编辑)</span>}</div></div>);
  return (<div className="ai-row-wrap"><div className="msg-row"><div className="ai-actions"><button className="ai-act-btn" onClick={onCopy} title="复制">{copied?'✓':'⎘'}</button>{isLast&&<><button className="ai-act-btn" onClick={onRegen} title="重新生成">↻</button><button className="ai-act-btn" onClick={onBranch} title="分支">⑂</button></>}<button className="ai-act-btn" onClick={()=>{setEditing(true);setEditVal(msg.content);}} title="编辑">✎</button></div>
  <div className="ai-bubble">{msg.routing&&<div className="route-inline"><span className="rt-intent">{msg.routing.intent}</span><span className="rt-arrow">{'→'}</span>{msg.routing.models.map(m=><span key={m} className="rt-model">{m}</span>)}</div>}
  {editing?(<div><textarea className="msg-edit-input" value={editVal} onChange={e=>setEditVal(e.target.value)} rows={8}/><div className="msg-edit-bar"><button onClick={()=>{onEdit(editVal);setEditing(false);}} className="msg-edit-btn">保存</button><button onClick={()=>setEditing(false)} className="msg-edit-btn msg-edit-cancel">取消</button></div></div>):<div dangerouslySetInnerHTML={{__html:renderRich(msg.content)}}/>}
  {msg.model&&<div className="model-foot">{msg.model}</div>}</div></div></div>);
};

const App: React.FC = () => {
  const dispatch = useAppDispatch(); const { sessions, activeSessionId, streaming, strategy, sidebarOpen, settingsOpen, settings, contextTokens } = useAppSelector(s => s.chat);
  const [input, setInput] = useState(''); const [thinkText, setThinkText] = useState('');
  const [showStrats, setShowStrats] = useState(false); const chatRef = useRef<HTMLDivElement>(null);
  const [pastedFiles, setPastedFiles] = useState<{dataUrl:string;name:string;text?:string}[]>([]);
  const [copiedId, setCopiedId] = useState(''); const [showTemplates, setShowTemplates] = useState(false);
  const [webSearchOn, setWebSearchOn] = useState(false); const [dragOver, setDragOver] = useState(false);
  const [showDash, setShowDash] = useState(false); const [showSched, setShowSched] = useState(false);
  const [listening, setListening] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false); const [mentionFilter, setMentionFilter] = useState('');
  const stopRef = useRef(false); const inputRef = useRef<HTMLTextAreaElement>(null);
  const active = sessions.find(s => s.id === activeSessionId);

  // Persist
  useEffect(() => { if (sessions.length > 0) saveSessions(sessions); }, [sessions]);
  useEffect(() => { const saved = loadSessions(); if (saved.length > 0 && sessions.length <= 1) { saved.forEach((s: ChatSession) => { if (!sessions.find(x => x.id === s.id) && s.id !== 'default') dispatch(addMessage({ sessionId: s.id, message: s.messages[0] || { id: '', role: 'user', content: '', timestamp: 0 } })); }); } }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', settings.theme); }, [settings.theme]);
  useEffect(() => { dispatch(setLanguage('zh-CN')); }, [dispatch]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, thinkText]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey||e.metaKey)&&e.key==='n') { e.preventDefault(); dispatch(ns()); } if (e.key==='Escape') { stopRef.current=true; dispatch(setStreaming(false)); setThinkText(''); } if ((e.ctrlKey||e.metaKey)&&e.key==='k') { e.preventDefault(); inputRef.current?.focus(); } if ((e.ctrlKey||e.metaKey)&&e.key==='b') { e.preventDefault(); dispatch(toggleSidebar()); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dispatch]);

  // @mention handling
  const mentionItems = useMemo(() => [{ type:'template',label:'模板',items:settings.promptTemplates.map(t=>({id:t.id,name:t.name,content:t.content}))},{ type:'file',label:'文件',items:pastedFiles.map((f,i)=>({id:'f'+i,name:f.name}))}],[settings.promptTemplates,pastedFiles]);
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => { const v = e.target.value; setInput(v); const at = v.lastIndexOf('@'); if (at >= 0 && v.slice(at).length < 20) { setMentionOpen(true); setMentionFilter(v.slice(at + 1).toLowerCase()); } else setMentionOpen(false); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'; };
  const insertMention = (content: string) => { setInput(prev => prev.replace(/@\S*$/, '') + content + ' '); setMentionOpen(false); inputRef.current?.focus(); };

  const sendQuery = useCallback(async (text: string, isRegen?: boolean) => {
    if (!text || streaming) return; stopRef.current = false;
    if (!isRegen) { setInput(''); const files = pastedFiles; setPastedFiles([]);
      let ctx = text;
      for (const f of files) { if (f.text) ctx += '\n\n[文件: '+f.name+']\n'+f.text.slice(0, 3000); }
      const um: ChatMessage = { id:'u'+Date.now(), role:'user', content:text, timestamp:Date.now() };
      dispatch(addMessage({ sessionId: activeSessionId!, message:um }));
    }
    dispatch(setStreaming(true)); setThinkText('正在分析…');

    try {
      if (webSearchOn) { try { const { webSearch } = await import('./utils/search'); const results = await webSearch(text, settings.apiKeys.serper); if (results.length>0&&!results[0].title.includes('未配置')) text += '\n[联网搜索]\n'+results.map(r=>'- '+r.title+': '+r.snippet).join('\n'); } catch {} }
      const images = pastedFiles.filter(f => f.dataUrl.startsWith('data:image')).map(f => f.dataUrl);
      const result = await window.electronAPI!.query({ text, strategy, images: images.length ? images : undefined });
      if (stopRef.current) return;
      setThinkText(result.routing.selected_models.join(', ')+'…');
      const resps = result.responses||[];
      const content = resps.length===1 ? resps[0].content||'(空)' : resps.map(r=>'**▸ '+r.model_id+'**\n\n'+(r.content||'')).join('\n\n---\n\n');
      if (settings.memory.enabled && content.length > 50) dispatch(addMemory({ key: text.slice(0,40), value: content.slice(0,200) }));
      dispatch(addMessage({ sessionId:activeSessionId!, message:{ id:'a'+Date.now(),role:'assistant',content,timestamp:Date.now(),model:result.routing.selected_models.join(', '),routing:{intent:result.routing.top_intent,models:result.routing.selected_models,rationale:result.routing.rationale} } }));
      try { window.electronAPI?.notify({ title:'Polaris', body: '回复已生成' }); } catch {}
    } catch(e:any) { if (!stopRef.current) dispatch(addMessage({ sessionId:activeSessionId!, message:{id:'e'+Date.now(),role:'assistant',content:'出错: '+(e.message||'未知'),timestamp:Date.now()} })); }
    dispatch(setStreaming(false)); setThinkText('');
  }, [streaming, strategy, activeSessionId, dispatch, pastedFiles, webSearchOn, settings]);

  const send = () => { const t = input.trim(); if (!t) return; sendQuery(t); };
  const copyMsg = (c: string) => { navigator.clipboard.writeText(c); setCopiedId(c.slice(0,20)); setTimeout(()=>setCopiedId(''),1500); };
  const regen = () => { if (!active||active.messages.length<2) return; const lu = [...active.messages].reverse().find(m=>m.role==='user'); if (lu) sendQuery(lu.content, true); };
  const editMsg = (v: string) => { if (!active) return; const la = [...active.messages].reverse().find(m=>m.role==='assistant'); if (la) dispatch(editMessage({sessionId:active.id,messageId:la.id,content:v})); };
  const doBranch = () => { if (!active||active.messages.length<2) return; const lu = [...active.messages].reverse().find(m=>m.role==='user'); if (lu) dispatch(branchSession({sourceSessionId:active.id,upToMessageId:lu.id})); };
  const exportChat = () => { if (!active) return; const md = active.messages.map(m=>`### ${m.role==='user'?'用户':'AI'}\n\n${m.content}\n`).join('\n---\n'); const blob = new Blob([md],{type:'text/markdown'}); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=active.name+'.md'; a.click(); };
  const handleDrop = async (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); for (const file of e.dataTransfer.files) { try { if (file.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => setPastedFiles(p => [...p,{dataUrl:r.result as string,name:file.name}]); r.readAsDataURL(file); } else { const { parseFile } = await import('./utils/fileParser'); const result = await parseFile(file); setPastedFiles(p => [...p,{dataUrl:'',name:file.name,text:result.text}]); } } catch {} } };
  const voiceToggle = () => {
    if (listening) { setListening(false); return; }
    setListening(true);
    import('./utils/voice').then(({ startListening }) => {
      startListening('zh-CN', (text: string) => { setInput(prev => prev + text); setListening(false); }, () => setListening(false));
    });
  };
  const pct = contextTokens.total > 0 ? Math.min(Math.round(contextTokens.used / contextTokens.total * 100), 100) : 0;

  return (<div className="polaris-app" onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}>
    <div className="titlebar"><div className="titlebar-left"><span className="tb-logo">{'✦ Polaris'}</span><div className="token-bar" style={{width:80,height:3,borderRadius:2,background:'var(--border)',overflow:'hidden',marginLeft:12}}><div style={{width:pct+'%',height:'100%',background:pct>80?'var(--red)':pct>50?'var(--amber)':'var(--green)',transition:'width .3s'}}/></div></div><div className="titlebar-center"/><div className="titlebar-right"><button className="tb-btn" onClick={()=>setShowDash(true)} title="仪表盘">⬡</button><button className="tb-btn" onClick={()=>setShowSched(true)} title="定时任务">⏱</button><button className="tb-btn" onClick={exportChat} title={T.export}>↓</button><button className="tb-btn" onClick={()=>dispatch(toggleSettings())} title="设置">{'⚙'}</button><WinBtns/></div></div>
    {dragOver && <div className="drag-overlay"><div className="drag-zone"><div className="empty-icon">{'✦'}</div><p>拖拽文件到此处上传</p></div></div>}
    {pastedFiles.length > 0 && <div className="img-preview">{pastedFiles.map((f,i)=><div key={i} className="file-chip"><span>{f.name}</span><button onClick={()=>setPastedFiles(p=>p.filter((_,j)=>j!==i))} className="file-chip-x">{'✕'}</button></div>)}</div>}
    <div className="polaris-body">
      {sidebarOpen && <SidebarView onClose={()=>dispatch(toggleSidebar())}/>}
      <div className="main"><div className="chat" ref={chatRef}>
        {(!active||active.messages.length===0)?(<div className="empty"><div className="empty-icon">{'✦'}</div><h2>{T.welcome}</h2><div className="suggestions">{SUGS.map((s,i)=><div key={i} className="sug" onClick={()=>{setInput(s);send()}}>{s}</div>)}</div></div>):(active.messages.map((m,i)=><MsgBubble key={m.id} msg={m} isLast={i===active.messages.length-1} onCopy={()=>copyMsg(m.content)} onRegen={regen} onEdit={editMsg} onBranch={doBranch} copied={copiedId===m.content.slice(0,20)}/>))}
        {thinkText&&(<div className="think-msg"><div className="think-dot"/><span>{thinkText}</span></div>)}
      </div>
      <div className="input-area">
        {showTemplates && <div className="tpl-panel">{settings.promptTemplates.map(t=><div key={t.id} className="tpl-item" onClick={()=>{setInput(t.content);setShowTemplates(false);}}><div className="tpl-name">{t.name}</div><div className="tpl-cat">{t.category}</div></div>)}</div>}
        {mentionOpen && <div className="mention-popup">{mentionItems.map(g=>g.items.filter((i:any)=>i.name.toLowerCase().includes(mentionFilter)).map((i:any)=><div key={i.id} className="mention-item" onClick={()=>insertMention(i.content||i.name)}><span className="mention-type">{g.label}</span><span>{i.name}</span></div>))}</div>}
        <div className="input-row">
          <ImageInput onImage={(d,f)=>setPastedFiles(p=>[...p,{dataUrl:d,name:f}])} disabled={streaming}/>
          <button className={'voice-btn'+(listening?' listening':'')} onClick={voiceToggle} disabled={streaming} title={T.voice}>{listening?'⏹':'🎤'}</button>
          <textarea ref={inputRef} id="chat-input" value={input} onChange={handleInput} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder="问点什么... @模板 @文件  拖拽文件上传" rows={1} disabled={streaming}/>
          {streaming ? <button className="stop-btn" onClick={()=>{stopRef.current=true;dispatch(setStreaming(false));setThinkText('');}} title={T.stop}>■</button>
          : <button className="send-btn" onClick={send} disabled={!input.trim()}><svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 5.5L2 14l3-6.5L2 2z"/></svg></button>}
        </div>
        <div className="input-options"><div style={{display:'flex',gap:6}}><div className="strat-picker" onMouseEnter={()=>setShowStrats(true)} onMouseLeave={()=>setShowStrats(false)}><span className="sp-label">{{best_quality:T.quality,cost_optimized:T.cost,ensemble:T.ensemble}[strategy]}</span>{showStrats&&<div className="sp-drop">{(['best_quality','cost_optimized','ensemble'] as Strategy[]).map(s=><div key={s} className={'sp-item'+(strategy===s?' sel':'')} onClick={()=>{dispatch(setStrategy(s));setShowStrats(false)}}>{{best_quality:T.quality,cost_optimized:T.cost,ensemble:T.ensemble}[s]}</div>)}</div>}</div><button className={'opt-chip'+(webSearchOn?' on':'')} onClick={()=>setWebSearchOn(!webSearchOn)}>{'🌐 '+(webSearchOn?'ON':'OFF')}</button><button className="opt-chip" onClick={()=>setShowTemplates(!showTemplates)}>{'📋'}</button></div><span className="input-hint">Ctrl+N 新对话 · Ctrl+B 侧边栏 · Ctrl+K 聚焦 · Esc 停止</span></div></div>
    </div></div>
    {settingsOpen && <SettingsPanel/>}{showDash && <AgentDashboard onClose={()=>setShowDash(false)}/>}{showSched && <TaskScheduler/>}
  </div>);
};

function renderRich(t: string): string {
  let h = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h = h.replace(/```mermaid\n([\s\S]*?)```/g,(_,c:string)=>'<div class="mermaid-block">'+c.trim()+'</div>');
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l:string,c:string)=>'<pre class="code-block"><div class="code-lang">'+(l||'text')+'</div><code>'+highlight(c.trim(),l)+'</code></pre>');
  h = h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>'); h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'); h = h.replace(/\*(.+?)\*/g,'<em>$1</em>');
  h = h.replace(/\$\$(.+?)\$\$/g,(_,f:string)=>'<div class="latex-block">'+f+'</div>');
  h = h.replace(/\$(.+?)\$/g,(_,f:string)=>'<span class="latex-inline">'+f+'</span>');
  h = h.replace(/^### (.+)/gm,'<h3>$1</h3>'); h = h.replace(/^## (.+)/gm,'<h2>$1</h2>'); h = h.replace(/^# (.+)/gm,'<h1>$1</h1>');
  h = h.replace(/^[-*] (.+)/gm,'<li>$1</li>'); h = h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');
  h = h.replace(/\n\n/g,'</p><p>'); h = h.replace(/\n/g,'<br/>'); return '<p>'+h+'</p>';
}
function highlight(c: string, l: string): string {
  const kw: Record<string,string[]>={js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except','raise','with','as']}; const w=kw[l]||[];
  let o=c;w.forEach(x=>{o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span class="hl-kw">'+x+'</span>')});
  o=o.replace(/(\".*?\")/g,'<span class="hl-str">$1</span>'); o=o.replace(/(\'.*?\')/g,'<span class="hl-str">$1</span>');
  o=o.replace(/(\/\/.*)/g,'<span class="hl-cm">$1</span>'); o=o.replace(/(\d+)/g,'<span class="hl-num">$1</span>'); return o;
}
export default App;
