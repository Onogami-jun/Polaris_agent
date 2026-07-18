import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from './store';
import { addMessage, editMessage, loadSessions as loadS, newSession as ns, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings, setTheme, setLanguage, branchSession, addMemory, deleteSession } from './store/chatSlice';
import type { ChatMessage, Strategy, ChatSession } from './store/chatSlice';
import { saveSessions, loadSessions, deleteSessionStorage } from './store/persist';
import SettingsPanel from './components/SettingsPanel';

// ── Icons ────────────────────────────────────────────────────
const I = { plus:'＋', search:'≡', close:'✕', send:'↑', stop:'■', copy:'⎘', regen:'↻', branch:'⑂', edit:'✎' };

// ── Suggestion prompts ────────────────────────────────────────
const SUGS = ['帮我写一封给投资人的项目介绍邮件','解释一下量子计算的基本原理','用 Python 写一个多线程下载器'];

// ── Window buttons ────────────────────────────────────────────
const WinBtns: React.FC = () => (<div className="wb-row">
  <button onClick={()=>window.electronAPI?.minimize()} className="wb">{'─'}</button>
  <button onClick={()=>window.electronAPI?.maximize()} className="wb">{'□'}</button>
  <button onClick={()=>window.electronAPI?.close()} className="wb wb-close">{'✕'}</button>
</div>);

// ── Sidebar ────────────────────────────────────────────────────
const SidebarView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const d = useAppDispatch();
  const { sessions, activeSessionId } = useAppSelector(s => s.chat);
  const [s, setS] = useState('');
  const list = s ? sessions.filter(x => x.name.toLowerCase().includes(s.toLowerCase())) : sessions;
  const fmt = (ts: number) => { const dt = new Date(ts); return dt.getMonth()+1+'/'+dt.getDate(); };
  return (<div className="side">
    <div className="side-hd"><div className="side-logo">POLARIS</div><button onClick={onClose} className="side-cl">{I.close}</button></div>
    <button className="side-new" onClick={()=>d(ns())}>{I.plus} 新对话</button>
    <div className="side-srch"><input placeholder="搜索…" value={s} onChange={e=>setS(e.target.value)}/></div>
    <div className="side-list">{list.map(s=>(
      <div key={s.id} className={'side-it'+(s.id===activeSessionId?' on':'')} onClick={()=>d(setActiveSession(s.id))}>
        <span className="side-dot"/>
        <span className="side-nm">{s.name}</span>
        <span className="side-dt">{fmt(s.createdAt)}</span>
        <button className="side-del" onClick={e=>{e.stopPropagation();d(deleteSession(s.id));deleteSessionStorage(s.id);}}>×</button>
      </div>))}</div>
    <div className="side-ft">v0.8.0</div>
  </div>);
};

// ── Message row ────────────────────────────────────────────────
const MsgRow: React.FC<{ msg: ChatMessage; isLast: boolean; onCopy: () => void; onRegen: () => void; onEdit: (v:string)=>void; onBranch: () => void; copied: boolean }> = ({ msg, isLast, onCopy, onRegen, onEdit, onBranch, copied }) => {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(msg.content);
  if (msg.role==='user') return (<div className="msg-row u"><div className="ub">{msg.content}{msg.edited&&<span className="ed">(已编辑)</span>}</div></div>);
  return (<div className="msg-row">
    <div className="ab">
      {msg.routing&&<div className="rt"><span className="rt-i">{msg.routing.intent}</span><span className="rt-a">{'→'}</span>{msg.routing.models.map(m=><span key={m} className="rt-m">{m}</span>)}</div>}
      {edit?(<div><textarea className="ed-tx" value={val} onChange={e=>setVal(e.target.value)} rows={6}/><div className="ed-bar"><button onClick={()=>{onEdit(val);setEdit(false)}} className="ed-bt">保存</button><button onClick={()=>setEdit(false)} className="ed-bt ed-c">取消</button></div></div>)
      :<div dangerouslySetInnerHTML={{__html:md(msg.content)}}/>}
      <div className="ab-ft">
        <span className="ab-md">{msg.model||''}</span>
        <span className="ab-act">
          <button onClick={onCopy} title="复制">{copied?'✓':I.copy}</button>
          {isLast&&<><button onClick={onRegen} title="重新生成">{I.regen}</button><button onClick={onBranch} title="分支">{I.branch}</button></>}
          <button onClick={()=>{setEdit(true);setVal(msg.content)}} title="编辑">{I.edit}</button>
        </span>
      </div>
    </div>
  </div>);
};

// ── Command Palette ────────────────────────────────────────────
const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const d = useAppDispatch();
  const [q, setQ] = useState('');
  const cmds = useMemo(() => {
    const all = [
      { id:'new',label:'新建对话',kbd:'Ctrl+N',action:()=>{d(ns());onClose()} },
      { id:'sidebar',label:'切换侧边栏',kbd:'Ctrl+B',action:()=>{d(toggleSidebar());onClose()} },
      { id:'settings',label:'打开设置',kbd:'Ctrl+,',action:()=>{d(toggleSettings());onClose()} },
      { id:'dash',label:'Agent 仪表盘',action:()=>onClose() },
      { id:'export',label:'导出对话为 Markdown',action:()=>onClose() },
    ];
    return q ? all.filter(x=>x.label.toLowerCase().includes(q.toLowerCase())) : all;
  }, [q, d, onClose]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key==='Escape') onClose(); }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); }, [onClose]);
  return (<div className="cp-overlay" onClick={onClose}><div className="cp-box" onClick={e=>e.stopPropagation()}>
    <input className="cp-in" autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="输入命令…"/>
    <div className="cp-list">{cmds.map(c=><div key={c.id} className="cp-item" onClick={c.action}><span>{c.label}</span><span className="cp-kbd">{c.kbd||''}</span></div>)}</div>
  </div></div>);
};

// ── Main App ────────────────────────────────────────────────────
const App: React.FC = () => {
  const d = useAppDispatch();
  const st = useAppSelector(s => s.chat);
  const { sessions, activeSessionId, streaming, strategy, sidebarOpen, settingsOpen, settings, contextTokens } = st;
  const [inp, setInp] = useState(''); const [think, setThink] = useState('');
  const [strats, setSts] = useState(false); const cr = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<{u:string;n:string;t?:string}[]>([]);
  const [cpid, setCid] = useState(''); const [tpls, setTpls] = useState(false);
  const [web, setWeb] = useState(false); const [drag, setDrag] = useState(false);
  const [dash, setDash] = useState(false); const [sched, setSched] = useState(false);
  const [cmdPal, setCmdPal] = useState(false);
  const stop = useRef(false); const ir = useRef<HTMLTextAreaElement>(null);
  const act = sessions.find(s => s.id === activeSessionId);

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => { document.documentElement.setAttribute('data-theme', settings.theme); }, [settings.theme]);
  useEffect(() => { d(setLanguage('zh-CN')); d(setTheme('dark'));
    const saved = loadSessions();
    if (saved.length > 0) d(loadS(saved));
  }, [d]);
  // Persist on change
  useEffect(() => { if (sessions.length > 0) { const t = setTimeout(()=>saveSessions(sessions), 300); return ()=>clearTimeout(t); } }, [sessions]);
  // Scroll
  useEffect(() => { cr.current?.scrollTo({ top: cr.current.scrollHeight, behavior: 'smooth' }); }, [act?.messages, think]);
  // Keybindings
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey||e.metaKey)&&e.key==='p') { e.preventDefault(); setCmdPal(true); }
      if (e.key==='Escape'&&!cmdPal) { stop.current=true; d(setStreaming(false)); setThink(''); }
      if ((e.ctrlKey||e.metaKey)&&e.key==='n') { e.preventDefault(); d(ns()); }
      if ((e.ctrlKey||e.metaKey)&&e.key==='b') { e.preventDefault(); d(toggleSidebar()); }
      if ((e.ctrlKey||e.metaKey)&&e.key===',') { e.preventDefault(); d(toggleSettings()); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [d, cmdPal]);

  const query = useCallback(async (text: string, regen?: boolean) => {
    if (!text || streaming) return; stop.current = false;
    if (!regen) { setInp('');
      const um: ChatMessage = { id:'u'+Date.now(), role:'user', content:text, timestamp:Date.now() };
      d(addMessage({ sessionId: activeSessionId!, message:um }));
    }
    d(setStreaming(true)); setThink('分析中…');
    try {
      let ctx = text;
      for (const f of files) { if (f.t) ctx += '\n[文件: '+f.n+']\n'+f.t.slice(0,3000); }
      if (web) { try { const { webSearch } = await import('./utils/search'); const r = await webSearch(text, settings.apiKeys.serper); if (r.length>0&&!r[0].title.includes('未配置')) ctx+='\n[搜索]\n'+r.map(x=>'- '+x.title+': '+x.snippet).join('\n'); } catch {} }
      const imgs = files.filter(f=>f.u.startsWith('data:image')).map(f=>f.u);
      const res = await window.electronAPI!.query({ text:ctx, strategy, images:imgs.length?imgs:undefined });
      if (stop.current) return;
      setThink(res.routing.selected_models.join(', '));
      const cnt = res.responses.length===1 ? res.responses[0].content||'' : res.responses.map(r=>'**▸ '+r.model_id+'**\n\n'+(r.content||'')).join('\n\n---\n\n');
      if (settings.memory.enabled&&cnt.length>50) d(addMemory({key:text.slice(0,40),value:cnt.slice(0,200)}));
      d(addMessage({ sessionId:activeSessionId!, message:{id:'a'+Date.now(),role:'assistant',content:cnt,timestamp:Date.now(),model:res.routing.selected_models.join(', '),routing:{intent:res.routing.top_intent,models:res.routing.selected_models,rationale:res.routing.rationale}} }));
      try { window.electronAPI?.notify({title:'Polaris',body:'回复已生成'}); } catch {}
    } catch(e:any) { if (!stop.current) d(addMessage({ sessionId:activeSessionId!, message:{id:'e'+Date.now(),role:'assistant',content:'出错: '+(e.message||''),timestamp:Date.now()} })); }
    d(setStreaming(false)); setThink(''); setFiles([]);
  }, [streaming, strategy, activeSessionId, d, files, web, settings]);

  const send = () => { const t = inp.trim(); if (!t) return; query(t); };
  const copy = (c: string) => { navigator.clipboard.writeText(c); setCid(c.slice(0,20)); setTimeout(()=>setCid(''),1500); };
  const rgn = () => { if (!act||act.messages.length<2) return; const u = [...act.messages].reverse().find(m=>m.role==='user'); if (u) query(u.content, true); };
  const edm = (v: string) => { if (!act) return; const a = [...act.messages].reverse().find(m=>m.role==='assistant'); if (a) d(editMessage({sessionId:act.id,messageId:a.id,content:v})); };
  const brn = () => { if (!act||act.messages.length<2) return; const u = [...act.messages].reverse().find(m=>m.role==='user'); if (u) d(branchSession({sourceSessionId:act.id,upToMessageId:u.id})); };
  const exp = () => { if (!act) return; const md = act.messages.map(m=>`### ${m.role==='user'?'用户':'AI'}\n\n${m.content}\n`).join('\n---\n'); const b = new Blob([md],{type:'text/markdown'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=act.name+'.md'; a.click(); };
  const drop = async (e: React.DragEvent) => { e.preventDefault(); setDrag(false);
    for (const f of e.dataTransfer.files) {
      if (f.type.startsWith('image/')) { const r = new FileReader(); r.onload=()=>setFiles(p=>[...p,{u:r.result as string,n:f.name}]); r.readAsDataURL(f); continue; }
      const t = await f.text(); setFiles(p=>[...p,{u:'',n:f.name,t:t.slice(0,5000)}]);
    }
  };
  const pct = contextTokens.total>0?Math.min(Math.round(contextTokens.used/contextTokens.total*100),100):0;

  return (<div className="app" onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={drop}>
    {/* Titlebar */}
    <div className="tb">
      <div className="tb-l"><span className="tb-lg">✦ Polaris</span><div className="tb-tk"><div className="tb-tk-f" style={{width:pct+'%',background:pct>80?'var(--red)':pct>50?'var(--amber)':'var(--green)'}}/></div></div>
      <div className="tb-r">
        <button className="tb-btn" onClick={()=>d(toggleSidebar())} title="侧边栏 Ctrl+B">{'☰'}</button>
        <button className="tb-btn" onClick={()=>setCmdPal(true)} title="命令面板 Ctrl+P">{'⌘'}</button>
        <button className="tb-btn" onClick={exp} title="导出">↓</button>
        <button className="tb-btn" onClick={()=>d(toggleSettings())} title="设置 Ctrl+,">{'⚙'}</button>
        <WinBtns/>
      </div>
    </div>
    {/* Drag overlay */}
    {drag&&<div className="dov"><div className="doz"><p>拖拽文件到此处上传</p></div></div>}
    {/* Files bar */}
    {files.length>0&&<div className="fb">{files.map((f,i)=><div key={i} className="fc"><span>{f.n}</span><button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} className="fcx">✕</button></div>)}</div>}
    <div className="body">
      {sidebarOpen&&<SidebarView onClose={()=>d(toggleSidebar())}/>}
      <div className="main">
        {/* Chat */}
        <div className="chat" ref={cr}>
          {(!act||act.messages.length===0)?(<div className="empty"><div className="elg">✦</div><h2>有什么我可以帮你的？</h2><p className="eh">Ctrl+P 打开命令面板 · Ctrl+N 新建对话</p><div className="esg">{SUGS.map((s,i)=><button key={i} className="es" onClick={()=>{setInp(s);send()}}>{s}</button>)}</div></div>)
          :(act.messages.map((m,i)=><MsgRow key={m.id} msg={m} isLast={i===act.messages.length-1} onCopy={()=>copy(m.content)} onRegen={rgn} onEdit={edm} onBranch={brn} copied={cpid===m.content.slice(0,20)}/>))}
          {think&&<div className="tm"><div className="tm-d"/><span>{think}</span></div>}
        </div>
        {/* Input */}
        <div className="ia">
          {tpls&&<div className="tpp">{settings.promptTemplates.map(t=><button key={t.id} className="tpi" onClick={()=>{setInp(t.content);setTpls(false);ir.current?.focus()}}><span className="tpn">{t.name}</span><span className="tpc">{t.category}</span></button>)}</div>}
          <div className="irr">
            <button className="vo-btn" onClick={async()=>{try{const{startListening}=await import('./utils/voice');startListening('zh-CN',(t:string)=>{setInp(p=>p+t)},()=>{})}catch{}}} disabled={streaming} title="语音">🎤</button>
            <textarea ref={ir} className="itx" value={inp} onChange={e=>{setInp(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,150)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="问点什么… 拖拽文件上传  ·  Ctrl+P 命令面板" rows={1} disabled={streaming}/>
            {streaming
              ?<button className="ib-st" onClick={()=>{stop.current=true;d(setStreaming(false));setThink('')}} title="停止 Esc"><span>{I.stop}</span></button>
              :<button className="ib-sd" onClick={send} disabled={!inp.trim()}><span>{I.send}</span></button>}
          </div>
          <div className="io">
            <div style={{display:'flex',gap:6}}>
              <div className="sp" onMouseEnter={()=>setSts(true)} onMouseLeave={()=>setSts(false)}>
                <span className="sl">{{best_quality:'✦ 优质',cost_optimized:'◆ 省钱',ensemble:'◈ 协同'}[strategy]}</span>
                {strats&&<div className="sd">{(['best_quality','cost_optimized','ensemble'] as Strategy[]).map(s=><div key={s} className={'si'+(strategy===s?' so':'')} onClick={()=>{d(setStrategy(s));setSts(false)}}>{{best_quality:'✦ 优质',cost_optimized:'◆ 省钱',ensemble:'◈ 协同'}[s]}</div>)}</div>}
              </div>
              <button className={'oc'+(web?' on':'')} onClick={()=>setWeb(!web)}>🌐 {web?'ON':'OFF'}</button>
              <button className="oc" onClick={()=>setTpls(!tpls)}>📋</button>
            </div>
            <span className="ih">Enter 发送 · Shift+Enter 换行</span>
          </div>
        </div>
      </div>
    </div>
    {settingsOpen&&<SettingsPanel/>}
    {cmdPal&&<CommandPalette onClose={()=>setCmdPal(false)}/>}
  </div>);
};

// ── Markdown renderer ──────────────────────────────────────────
function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```mermaid\n([\s\S]*?)```/g,(_,c:string)=>'<div class="mdb">'+c.trim()+'</div>');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l:string,c:string)=>'<pre class="cb"><div class="cb-l">'+(l||'text')+'</div><code>'+hl(c.trim(),l)+'</code></pre>');h=h.replace(/`([^`]+)`/g,'<code>$1</code>');h=h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');h=h.replace(/\$\$(.+?)\$\$/g,(_,f:string)=>'<div class="lx">'+f+'</div>');h=h.replace(/\$(.+?)\$/g,(_,f:string)=>'<span class="li">'+f+'</span>');h=h.replace(/^### (.+)/gm,'<h3>$1</h3>');h=h.replace(/^## (.+)/gm,'<h2>$1</h2>');h=h.replace(/^# (.+)/gm,'<h1>$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li>$1</li>');h=h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');h=h.replace(/\n\n/g,'</p><p>');h=h.replace(/\n/g,'<br/>');return'<p>'+h+'</p>'}
function hl(c:string,l:string):string{const kw:Record<string,string[]>={js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except','raise','with','as','None','True','False'],ts:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this','interface','type','extends']};const w=kw[l]||[];let o=c;w.forEach(x=>{o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span class="hk">'+x+'</span>')});o=o.replace(/(\".*?\")/g,'<span class="hs">$1</span>');o=o.replace(/(\'.*?\')/g,'<span class="hs">$1</span>');o=o.replace(/(\/\/.*)/g,'<span class="hc">$1</span>');o=o.replace(/(\d+)/g,'<span class="hn">$1</span>');return o}
export default App;
