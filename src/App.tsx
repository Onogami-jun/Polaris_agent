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
    <div className="sessions">{sessions.map(s => <div key={s.id} className={'sess-item'+(s.id===activeSessionId?' active':'')} onClick={()=>dispatch(setActiveSession(s.id))}><div className="sess-dot"/><div className="sess-name">{s.name}</div></div>)}</div>
    <div className="sidebar-foot">v0.4.0 · BitWool Studio</div></div>
  );
};

const MsgBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  if (msg.role === 'user') return <div className="msg-row user"><div className="user-bubble">{msg.content}</div></div>;
  return (<div className="msg-row"><div className="ai-bubble">{msg.routing&&<div className="route-inline"><span className="rt-intent">{msg.routing.intent}</span><span className="rt-arrow">{'→'}</span>{msg.routing.models.map(m=><span key={m} className="rt-model">{m}</span>)}</div>}<div dangerouslySetInnerHTML={{__html:md(msg.content)}}/>{msg.model&&<div className="model-foot">{msg.model}</div>}</div></div>);
};

// Click ripple animation
const ClickRipple: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div className="click-ripple" style={{ left: x - 15, top: y - 15, position: 'fixed', zIndex: 9999, width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--amber)', animation: 'click-pop .6s ease-out forwards', pointerEvents: 'none' }} />
);

const DesktopActionBanner: React.FC<{ text: string }> = ({ text }) => (
  <div className="desk-banner">{'▸'} {text}</div>
);

const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const { sessions, activeSessionId, streaming, strategy, sidebarOpen, settingsOpen } = useAppSelector(s => s.chat);
  const [input, setInput] = useState(''); const [thinkText, setThinkText] = useState('');
  const [showStrats, setShowStrats] = useState(false); const chatRef = useRef<HTMLDivElement>(null);
  const [deskMode, setDeskMode] = useState(false);
  const [deskAction, setDeskAction] = useState('');
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [doingDesk, setDoingDesk] = useState(false);
  const active = sessions.find(s => s.id === activeSessionId);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages, thinkText, deskAction]);

  // Clean up ripples
  useEffect(() => {
    if (ripples.length > 0) { const t = setTimeout(() => setRipples([]), 700); return () => clearTimeout(t); }
  }, [ripples]);

  const send = useCallback(async () => {
    const t = input.trim(); if (!t || streaming) return;
    setInput(''); dispatch(setStreaming(true)); setThinkText('Analyzing intent…');
    const um: ChatMessage = { id: 'u'+Date.now(), role:'user', content:t, timestamp:Date.now() };
    dispatch(addMessage({ sessionId: activeSessionId!, message:um }));

    // Check if this is a desktop automation command
    const isDeskCmd = t.toLowerCase().includes('open ') || t.toLowerCase().includes('click ') || t.toLowerCase().includes('type ') || t.toLowerCase().includes('桌面') || t.toLowerCase().includes('desktop') || t.toLowerCase().includes('帮我打开') || t.toLowerCase().includes('帮我搜') || t.toLowerCase().includes('search for') || t.toLowerCase().includes('go to');

    if (isDeskCmd) {
      setDeskMode(true);
      setDoingDesk(true);
      setDeskAction('Taking screenshot…');
      try {
        // Step 1: Screenshot
        const screenshot = await window.electronAPI!.desktopScreenshot();
        // Step 2: Ask agent what to do
        setDeskAction('Analyzing screen…');
        const step1 = await window.electronAPI!.desktopAgentStep({ goal: t, screenshot: screenshot || '', history: '' });

        if (step1?.action) {
          const a = step1.action;
          // Step 3: Execute the action
          setDeskAction(a.reason || ('Running: ' + a.action));
          await executeDesktopAction(a);
          // Step 4: Take another screenshot to verify
          setDeskAction('Verifying result…');
          setTimeout(async () => {
            const ss2 = await window.electronAPI!.desktopScreenshot();
            const step2 = await window.electronAPI!.desktopAgentStep({ goal: t, screenshot: ss2 || '', history: step1.raw.slice(0, 500) });
            if (step2?.action?.action === 'done') {
              setDeskAction('✓ ' + (step2.action.summary || 'Done'));
              setTimeout(() => { setDeskMode(false); setDeskAction(''); }, 2000);
            } else {
              // Execute second action
              setDeskAction(step2.action.reason || ('Running: ' + step2.action.action));
              await executeDesktopAction(step2.action);
              setDeskAction('✓ Task complete');
              setTimeout(() => { setDeskMode(false); setDeskAction(''); }, 2000);
            }
          }, 1200);

          const resultMsg: ChatMessage = { id:'a'+Date.now(), role:'assistant', content: '**Desktop Action:** ' + (a.reason || t) + '\n\n' + step1.raw.slice(0, 800), timestamp:Date.now(), model: 'desktop-agent', routing: { intent: 'desktop', models: ['desktop-agent'], rationale: a.action + ': ' + (a.reason || '') } };
          dispatch(addMessage({ sessionId: activeSessionId!, message: resultMsg }));
        }
      } catch (e:any) {
        setDeskAction('✗ Error: ' + (e.message || ''));
        dispatch(addMessage({ sessionId: activeSessionId!, message: { id:'e'+Date.now(), role:'assistant', content:'Desktop error: '+(e.message||'unknown'), timestamp:Date.now() } }));
        setTimeout(() => { setDeskMode(false); setDeskAction(''); }, 3000);
      }
      setDoingDesk(false);
    } else {
      // Normal AI chat
      try {
        const result = await window.electronAPI!.query({ text:t, strategy });
        setThinkText('Routing to: ' + result.routing.selected_models.join(', ') + '…');
        const resps = result.responses||[];
        const content = resps.length===1 ? resps[0].content||'(empty)' : resps.map(r=>'**▸ '+r.model_id+'**\n\n'+(r.content||'')).join('\n\n---\n\n');
        const am: ChatMessage = { id:'a'+Date.now(),role:'assistant',content,timestamp:Date.now(),model:result.routing.selected_models.join(', '),routing:{intent:result.routing.top_intent,models:result.routing.selected_models,rationale:result.routing.rationale} };
        dispatch(addMessage({ sessionId:activeSessionId!, message:am }));
      } catch(e:any) { dispatch(addMessage({ sessionId:activeSessionId!, message:{id:'e'+Date.now(),role:'assistant',content:'Error: '+(e.message||'unknown'),timestamp:Date.now()} })); }
    }
    dispatch(setStreaming(false)); setThinkText('');
  }, [input, streaming, strategy, activeSessionId, dispatch]);

  const executeDesktopAction = useCallback(async (action: any) => {
    if (!action) return;
    const api = window.electronAPI!;
    switch (action.action) {
      case 'open_browser': if (action.url) api.desktopOpenBrowser(action.url); break;
      case 'open_app': if (action.path) api.desktopOpenApp(action.path); break;
      case 'open_explorer': if (action.path) api.desktopOpenExplorer(action.path); break;
      case 'focus_window': if (action.title) api.desktopFocusWindow(action.title); break;
      case 'type': if (action.text) api.desktopTypeText(action.text); break;
      case 'press_key': if (action.key) api.desktopPressKey(action.key); break;
      case 'hotkey': if (action.combo) api.desktopHotkey(action.combo); break;
      case 'move_mouse': if (action.x !== undefined && action.y !== undefined) { api.desktopMoveMouse(action.x, action.y); } break;
      case 'click': case 'click_mouse':
        if (action.x !== undefined && action.y !== undefined) {
          api.desktopClickMouse(action.x, action.y, action.button || 'left');
          setRipples([{ id: Date.now(), x: action.x, y: action.y }]);
        }
        break;
      case 'double_click': if (action.x !== undefined && action.y !== undefined) { api.desktopDoubleClick(action.x, action.y); setRipples([{ id: Date.now(), x: action.x, y: action.y }]); } break;
      case 'scroll': if (action.direction) api.desktopScrollMouse(action.direction, action.amount || 3); break;
      case 'read_clipboard': await api.desktopGetClipboard(); break;
      case 'write_clipboard': if (action.text) api.desktopSetClipboard(action.text); break;
      case 'list_files': if (action.path) await api.desktopListFiles(action.path); break;
      case 'run_command': if (action.command) await api.desktopRunCommand(action.command); break;
      case 'write_file': if (action.path && action.content) api.desktopWriteFile(action.path, action.content); break;
      case 'wait': if (action.ms) await new Promise(r => setTimeout(r, action.ms)); break;
    }
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); send(); } }, [send]);

  return (<div className="polaris-app">
    <div className="titlebar"><div className="titlebar-left"><span className="tb-logo">{'✦ Polaris'}</span></div><div className="titlebar-center"/><div className="titlebar-right"><button className="tb-btn" onClick={() => dispatch(toggleSidebar())} title="Sidebar">{'☰'}</button><button className="tb-btn" onClick={() => dispatch(toggleSettings())} title="Settings">{'⚙'}</button><WinBtns/></div></div>

    {/* Desktop action overlay */}
    {deskMode && (
      <div className="desk-overlay">
        <div className="desk-banner">
          <div className="desk-dot" />
          <span>{deskAction}</span>
        </div>
      </div>
    )}
    {/* Click ripple animations */}
    {ripples.map(r => <ClickRipple key={r.id} x={r.x} y={r.y} />)}

    <div className="polaris-body">
      {sidebarOpen && <SidebarView onClose={()=>dispatch(toggleSidebar())}/>}
      <div className="main">
        <div className="chat" ref={chatRef}>
          {(!active||active.messages.length===0)?(<div className="empty">
            <div className="empty-icon">{'✦'}</div>
            <h2>How can I help you?</h2>
            <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>I can also control your desktop — try "Open Chrome" or "Search for AI news"</p>
            <div className="suggestions">{SUGGESTIONS.map((s,i)=><div key={i} className="sug" onClick={()=>{setInput(s);send()}}>{s}</div>)}</div>
          </div>):(active.messages.map(m=><MsgBubble key={m.id} msg={m}/>))}
          {thinkText&&(<div className="think-msg"><div className="think-dot"/><span>{thinkText}</span></div>)}
        </div>
        <div className="input-area"><div className="input-row"><textarea value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,150)+'px'}} onKeyDown={onKeyDown} placeholder="Ask anything... or try 'Open Chrome and search AI news'" rows={1} disabled={streaming||doingDesk}/><button className="send-btn" onClick={send} disabled={(streaming||doingDesk)||!input.trim()}><svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 5.5L2 14l3-6.5L2 2z"/></svg></button></div>
        <div className="input-options"><div className="strat-picker" onMouseEnter={()=>setShowStrats(true)} onMouseLeave={()=>setShowStrats(false)}><span className="sp-label">{{best_quality:'✦ Best Quality',cost_optimized:'◆ Cost-Saving',ensemble:'◈ Ensemble'}[strategy]}</span>{showStrats&&(<div className="sp-drop">{(['best_quality','cost_optimized','ensemble'] as Strategy[]).map(s=><div key={s} className={'sp-item'+(strategy===s?' sel':'')} onClick={()=>{dispatch(setStrategy(s));setShowStrats(false)}}>{{best_quality:'✦ Best Quality',cost_optimized:'◆ Cost-Saving',ensemble:'◈ Ensemble'}[s]}</div>)}</div>)}</div><span className="input-hint">Enter to send · Shift+Enter for new line</span></div></div>
      </div>
    </div>
    {settingsOpen && <SettingsPanel/>}
  </div>);
};

function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,__,c:string)=>'<pre><code>'+c.trim()+'</code></pre>');h=h.replace(/`([^`]+)`/g,'<code>$1</code>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');h=h.replace(/^### (.+)/gm,'<h3>$1</h3>');h=h.replace(/^## (.+)/gm,'<h2>$1</h2>');h=h.replace(/^# (.+)/gm,'<h1>$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li>$1</li>');h=h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');h=h.replace(/\n\n/g,'</p><p>');h=h.replace(/\n/g,'<br/>');return'<p>'+h+'</p>'}
export default App;
