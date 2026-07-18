import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from './store';
import { addMessage, newSession as ns, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings } from './store/chatSlice';
import type { ChatMessage, Strategy } from './store/chatSlice';
import SettingsPanel from './components/SettingsPanel';

const SUGGESTIONS = ['Write a multithreaded downloader in Python','Write a project intro email to investors','Explain quantum computing simply','Analyze stress causes and solutions'];

const WinBtns: React.FC = () => (
  <div className="win-btns">
    <button onClick={() => window.electronAPI?.minimize()} className="wb">{'─'}</button>
    <button onClick={() => window.electronAPI?.maximize()} className="wb">{'□'}</button>
    <button onClick={() => window.electronAPI?.close()} className="wb wb-close">{'✕'}</button>
  </div>
);

const SidebarView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useAppDispatch();
  const { sessions, activeSessionId } = useAppSelector(s => s.chat);
  return (
    <div className="sidebar"><div className="sidebar-header"><div className="sb-logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2v4l3-2-3 4m0 8v4l-3-2 3-4m6-2l-2-3 4 3m-8 6l-2-3-4 3"/></svg><span>POLARIS</span></div><button onClick={onClose} className="sb-close">{'✕'}</button></div>
    <button className="new-chat-btn" onClick={() => dispatch(ns())}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>New Chat</button>
    <div className="sessions">{sessions.map(s => <div key={s.id} className={'sess-item' + (s.id===activeSessionId?' active':'')} onClick={()=>dispatch(setActiveSession(s.id))}><div className="sess-dot"/><div className="sess-name">{s.name}</div></div>)}</div>
    <div className="sidebar-foot">v0.3.0 · BitWool Studio</div></div>
  );
};

const MsgBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  if (msg.role === 'user') return <div className="msg-row user"><div className="user-bubble">{msg.content}</div></div>;
  return (<div className="msg-row"><div className="ai-bubble">{msg.routing&&<div className="route-inline"><span className="rt-intent">{msg.routing.intent}</span><span className="rt-arrow">{'→'}</span>{msg.routing.models.map(m=><span key={m} className="rt-model">{m}</span>)}</div>}<div dangerouslySetInnerHTML={{__html:md(msg.content)}}/>{msg.model&&<div className="model-foot">{msg.model}</div>}</div></div>);
};

const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const { sessions, activeSessionId, streaming, strategy, sidebarOpen, settingsOpen } = useAppSelector(s => s.chat);
  const [input, setInput] = useState(''); const [thinkText, setThinkText] = useState('');
  const [showStrats, setShowStrats] = useState(false); const chatRef = useRef<HTMLDivElement>(null);
  const active = sessions.find(s => s.id === activeSessionId);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, thinkText]);

  const send = useCallback(async () => {
    const t = input.trim(); if (!t || streaming) return;
    setInput(''); dispatch(setStreaming(true)); setThinkText('Analyzing intent…');
    const um: ChatMessage = { id: 'u'+Date.now(), role:'user', content:t, timestamp:Date.now() };
    dispatch(addMessage({ sessionId: activeSessionId!, message:um }));
    try {
      const result = await window.electronAPI!.query({ text:t, strategy });
      setThinkText('Routing to: ' + result.routing.selected_models.join(', ') + '…');
      const resps = result.responses||[];
      const content = resps.length===1 ? resps[0].content||'(empty)' : resps.map(r=>'**▸ '+r.model_id+'**\n\n'+(r.content||'')).join('\n\n---\n\n');
      const am: ChatMessage = { id:'a'+Date.now(),role:'assistant',content,timestamp:Date.now(),model:result.routing.selected_models.join(', '),routing:{intent:result.routing.top_intent,models:result.routing.selected_models,rationale:result.routing.rationale} };
      dispatch(addMessage({ sessionId:activeSessionId!, message:am }));
    } catch(e:any) { dispatch(addMessage({ sessionId:activeSessionId!, message:{id:'e'+Date.now(),role:'assistant',content:'Error: '+(e.message||'unknown'),timestamp:Date.now()} })); }
    dispatch(setStreaming(false)); setThinkText('');
  }, [input, streaming, strategy, activeSessionId, dispatch]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); send(); } }, [send]);

  return (<div className="polaris-app">
    <div className="titlebar"><div className="titlebar-left"><span className="tb-logo">{'✦ Polaris'}</span></div><div className="titlebar-center"/><div className="titlebar-right"><button className="tb-btn" onClick={()=>dispatch(toggleSidebar())} title="Sidebar">{'☰'}</button><button className="tb-btn" onClick={()=>dispatch(toggleSettings())} title="Settings">{'⚙'}</button><WinBtns/></div></div>
    <div className="polaris-body">
      {sidebarOpen && <SidebarView onClose={()=>dispatch(toggleSidebar())}/>}
      <div className="main">
        <div className="chat" ref={chatRef}>
          {(!active||active.messages.length===0)?(<div className="empty"><div className="empty-icon">{'✦'}</div><h2>How can I help you?</h2><div className="suggestions">{SUGGESTIONS.map((s,i)=><div key={i} className="sug" onClick={()=>{setInput(s);send()}}>{s}</div>)}</div></div>):(active.messages.map(m=><MsgBubble key={m.id} msg={m}/>))}
          {thinkText&&(<div className="think-msg"><div className="think-dot"/><span>{thinkText}</span></div>)}
        </div>
        <div className="input-area"><div className="input-row"><textarea value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,150)+'px'}} onKeyDown={onKeyDown} placeholder="Ask anything..." rows={1} disabled={streaming}/><button className="send-btn" onClick={send} disabled={streaming||!input.trim()}><svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 5.5L2 14l3-6.5L2 2z"/></svg></button></div>
        <div className="input-options"><div className="strat-picker" onMouseEnter={()=>setShowStrats(true)} onMouseLeave={()=>setShowStrats(false)}><span className="sp-label">{{best_quality:'✦ Best Quality',cost_optimized:'◆ Cost-Saving',ensemble:'◈ Ensemble'}[strategy]}</span>{showStrats&&(<div className="sp-drop">{(['best_quality','cost_optimized','ensemble'] as Strategy[]).map(s=><div key={s} className={'sp-item'+(strategy===s?' sel':'')} onClick={()=>{dispatch(setStrategy(s));setShowStrats(false)}}>{{best_quality:'✦ Best Quality',cost_optimized:'◆ Cost-Saving',ensemble:'◈ Ensemble'}[s]}</div>)}</div>)}</div><span className="input-hint">Enter to send · Shift+Enter for new line</span></div></div>
      </div>
    </div>
    {settingsOpen && <SettingsPanel/>}
  </div>);
};

function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,__,c:string)=>'<pre><code>'+c.trim()+'</code></pre>');h=h.replace(/`([^`]+)`/g,'<code>$1</code>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');h=h.replace(/^### (.+)/gm,'<h3>$1</h3>');h=h.replace(/^## (.+)/gm,'<h2>$1</h2>');h=h.replace(/^# (.+)/gm,'<h1>$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li>$1</li>');h=h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');h=h.replace(/\n\n/g,'</p><p>');h=h.replace(/\n/g,'<br/>');return'<p>'+h+'</p>'}
export default App;
