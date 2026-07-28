import React,{useState,useCallback,useRef,useEffect,useMemo}from'react';
import{useAppSelector,useAppDispatch}from'./store';
import{addMessage,editMessage,loadSessions as lr,newSession as ns,setActiveSession,setStreaming,setStrategy,toggleSidebar,toggleSettings,setTheme,deleteSession,branchSession,addMemory}from'./store/chatSlice';
import type{ChatMessage,Strategy}from'./store/chatSlice';
import{saveSessions,loadSessions as ld}from'./store/persist';
import SettingsPanel from'./components/SettingsPanel';

const SUGGESTIONS=['背包容量50，3件物品价值60 100 120，重量10 20 30','排产5个任务，处理时间2 3 1 4 2','指派4个工人做4个任务，成本10 2 8 7  5 12 3 6','车辆路径，5个客户，需求量1 2 1 3 2，车辆容量5'];

// Toast notification component
const Toast:React.FC<{toasts:any[];onDone:(id:number)=>void}>=({toasts,onDone})=>{
  return <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:8}}>
    {toasts.map((t:any)=><div key={t.id} style={{padding:'10px 18px',borderRadius:10,fontSize:13,color:'#fff',maxWidth:380,background:t.type==='error'?'#e53e3e':t.type==='warn'?'#d69e2e':'#3d36e0',boxShadow:'0 4px 16px rgba(0,0,0,.2)',animation:'toastIn .3s ease-out'}}>{t.msg}</div>)}
  </div>;
};

const WinBtns=()=>(<div className="wb-row"><button onClick={()=>window.electronAPI?.minimize()}className="wb">&#xe000;</button><button onClick={()=>window.electronAPI?.maximize()}className="wb">&#xe001;</button><button onClick={()=>window.electronAPI?.close()}className="wb wb-close">&#xe003;</button></div>);

const MsgRow:React.FC<{msg:ChatMessage;isLast:boolean;onCopy:()=>void;onRegen:()=>void;onEdit:(v:string)=>void;onBranch:()=>void;cid:boolean}>=({msg,isLast,onCopy,onRegen,onEdit,onBranch,cid})=>{
  const[ed,setEd]=useState(false);const[v,setV]=useState(msg.content);const[rtOpen,setRtOpen]=useState(false);
  if(msg.role==='user')return(<div className="msg-row u"><div className="ub">{msg.content}{msg.edited&&<span className="ed">(edited)</span>}</div></div>);
  return(<div className="msg-row"><div className="ab">
    {msg.routing&&<div className="rt-wrap"><button className="rt-toggle"onClick={()=>setRtOpen(!rtOpen)}>{rtOpen?'▾':'▸'} {msg.routing.intent}{msg.routing.models.length>1?` +${msg.routing.models.length}`:''}</button><div className={'rt-body'+(rtOpen?' open':'')}><span className="rt-i">{msg.routing.intent}</span>→{msg.routing.models.map((m,i)=><span key={i}className="rt-m">{m}</span>)}</div></div>}
    {ed?(<div><textarea className="ed-tx"value={v}onChange={e=>setV(e.target.value)}rows={6}/><div className="ed-bar"><button onClick={()=>{onEdit(v);setEd(false)}}className="ed-bt">Save</button><button onClick={()=>setEd(false)}className="ed-bt ed-c">Cancel</button></div></div>):<div dangerouslySetInnerHTML={{__html:md(msg.content)}}/>}
    <div className="ab-ft"><span className="ab-md">{msg.model||''}</span><span className="ab-act"><button onClick={onCopy}title="Copy">{cid?'Copied':'Copy'}</button>{isLast&&<><button onClick={onRegen}title="Retry">Retry</button><button onClick={onBranch}title="Branch">Branch</button></>}<button onClick={()=>{setEd(true);setV(msg.content)}}title="Edit">Edit</button></span></div></div></div>);
};

const CmdPalette:React.FC<{onClose:()=>void;onCommand:(cmd:string)=>void}>=({onClose,onCommand})=>{
  const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);const[q,setQ]=useState('');const cmds=useMemo(()=>{const all=[
    {id:'quality',l:'Best Quality',k:'Strategy',a:()=>{d(setStrategy('best_quality'));onClose()}},
    {id:'cost',l:'Cost Optimized',k:'Strategy',a:()=>{d(setStrategy('cost_optimized'));onClose()}},
    {id:'ensemble',l:'Ensemble',k:'Strategy',a:()=>{d(setStrategy('ensemble'));onClose()}},
    {id:'new',l:'New Session',k:'Ctrl+N',a:()=>{d(ns());onClose()}},
    {id:'sidebar',l:'Toggle Sidebar',k:'Ctrl+B',a:()=>{d(toggleSidebar());onClose()}},
    {id:'settings',l:'Settings',k:'Ctrl+,',a:()=>{d(toggleSettings());onClose()}},
    {id:'export',l:'Export Markdown',k:'',a:()=>{onCommand('export');onClose()}},
    {id:'theme',l:'Toggle Theme',k:'',a:()=>{const ts=sc.settings.theme==='dark'?'light':'dark';d(setTheme(ts));onClose()}},
  ];return q?all.filter(x=>x.l.toLowerCase().includes(q.toLowerCase())):all},[q,d,onClose,sc.settings.theme,onCommand]);
  return(<div className="cp-overlay"onClick={onClose}><div className="cp-box"onClick={e=>e.stopPropagation()}><input className="cp-in"autoFocus value={q}onChange={e=>setQ(e.target.value)}placeholder="Type a command..."/><div className="cp-list">{cmds.map(c=><div key={c.id}className="cp-item"onClick={c.a}><span>{c.l}</span><span className="cp-kbd">{c.k}</span></div>)}</div></div></div>);
};

const IntCard:React.FC<{card:any;onConfirm:(c:any)=>void;onDismiss:(c:any)=>void}>=({card,onConfirm,onDismiss})=>(<div className={`int-card L${card.level||2}`}><span className="int-body">{card.body}</span><div className="int-acts">{card.actions?card.actions.map((a:any)=><button key={a.label}className="int-btn"onClick={()=>a.action==='dismiss'?onDismiss(card):onConfirm(card)}>{a.label}</button>):<><button className="int-btn"onClick={()=>onConfirm(card)}>Accept</button><button className="int-btn"onClick={()=>onDismiss(card)}>Dismiss</button></>}</div></div>);

const PlanCard:React.FC<{plan:any;onConfirm:()=>void;onReject:()=>void;progress:any}>=({plan,onConfirm,onReject,progress})=>(<div className="plan-card"><div className="plan-hdr"><span className="plan-title">Execution Plan</span></div><p className="plan-req">{plan.request?.slice(0,80)}</p><div className="plan-steps">{plan.steps?.map((s:any)=><div key={s.id}className={`plan-step${progress&&progress.step===s.id?' active':''}${progress&&progress.step===s.id&&progress.type==='step_done'?' done':''}`}><span className="ps-check">{progress&&progress.step===s.id&&progress.type==='step_done'?'✓':progress&&progress.step===s.id?'●':'○'}</span><span>{s.description}</span><span className="ps-risk"style={{color:s.risk==='high'?'var(--red)':''}}>{s.risk}</span></div>)}</div><div className="plan-acts">{!progress?<><button className="plan-btn plan-yes"onClick={onConfirm}>Execute</button><button className="plan-btn plan-no"onClick={onReject}>Cancel</button></>:<button className="plan-btn plan-no"onClick={onReject}>Stop</button>}</div></div>);

const App:React.FC=()=>{
  const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);
  const{sessions,activeSessionId,streaming,strategy,sidebarOpen,settingsOpen,settings,contextTokens}=sc;
  const[inp,setInp]=useState('');const[thk,setThk]=useState('');
  const cr=useRef<HTMLDivElement>(null);const ir=useRef<HTMLTextAreaElement>(null);
  const[fs,setFs]=useState<{u:string;n:string;t?:string}[]>([]);
  const[cid,setCid]=useState('');const[tpl,setTpl]=useState(false);const[web,setWeb]=useState(false);
  const[drag,setDrag]=useState(false);const[cmd,setCmd]=useState(false);
  const[splash,setSplash]=useState(true);
  const[splashFade,setSplashFade]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>{setSplashFade(true);setTimeout(()=>setSplash(false),500)},2000);return()=>clearTimeout(t)},[]);
  const[toasts,setToasts]=useState<any[]>([]);
  const dispatchRef=useRef(d);
  dispatchRef.current=d;
  const showToast=(msg:string,type:string='error')=>{const id=Date.now();setToasts(p=>[...p.slice(-3),{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000)};
  const stop=useRef(false);const act=sessions.find(s=>s.id===activeSessionId);
  const[interventions,setInterventions]=useState<any[]>([]);
  const[plan,setPlan]=useState<any>(null);const[planProg,setPlanProg]=useState<any>(null);const[planId,setPlanId]=useState('');
  const pct=contextTokens.total>0?Math.min(Math.round(contextTokens.used/Math.max(contextTokens.total,1)*100),100):0;

  useEffect(()=>{document.documentElement.setAttribute('data-theme',settings.theme)},[settings.theme]);
  useEffect(()=>{d(setTheme(settings.theme));const s=ld();if(s.length>0)d(lr(s))},[]);
  useEffect(()=>{if(sessions.length>0){const t=setTimeout(()=>saveSessions(sessions),500);return()=>clearTimeout(t)}},[sessions]);
  useEffect(()=>{cr.current?.scrollTo({top:cr.current.scrollHeight,behavior:'smooth'})},[act?.messages,thk,interventions]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='p'){e.preventDefault();setCmd(true)}if(e.key==='Escape'){stop.current=true;d(setStreaming(false));setThk('');setCmd(false)}if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();d(ns())}if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();d(toggleSidebar())}if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();d(toggleSettings())}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[d]);
  useEffect(()=>{const api=window.electronAPI;if(!api)return;api.monitorStart();api.onIntervention((card:any)=>{card.ts=Date.now();setInterventions(p=>[...p.slice(-4),card])});api.onPlanProgress((data:any)=>setPlanProg(data));api.onStreamError((ed:any)=>{showToast('Stream Error: '+(ed?.message||'未知'),'error');dispatchRef.current(setStreaming(false));setThk('')});let kc=0;const onKb=()=>{kc++;if(kc%30===0)api.monitorUpdate({count:kc,lastPress:Date.now(),window:document.title})};window.addEventListener('keydown',onKb);return()=>window.removeEventListener('keydown',onKb)},[]);

  const query=useCallback(async(t:string,rgn?:boolean)=>{
    if(!t||streaming)return;stop.current=false;
    console.log('[App] query start:',t.slice(0,50),'sessionId:',activeSessionId);
    const sid=activeSessionId||'default';
    const imgs=fs.filter(f=>f.u.startsWith('data:image')).map(f=>f.u);
    const txts=fs.filter(f=>f.t).map(f=>'[File: '+f.n+']\n'+f.t).join('\n');
    setInp('');setFs([]);
    if(!rgn){
      console.log('[App] adding user message to session:',sid);
      d(addMessage({sessionId:sid,message:{id:'u'+Date.now(),role:'user',content:t,timestamp:Date.now()}}));
    }
    d(setStreaming(true));setThk('Thinking...');
    try{
      let ctx=t;if(txts)ctx+='\n\n'+txts;
      if(web){try{const{webSearch}=await import('./utils/search');const r=await webSearch(t,settings.apiKeys.serper);if(r.length>0&&!r[0].title.includes('not configured'))ctx+='\n[Web]\n'+r.map((x:any)=>'- '+x.title+': '+x.snippet).join('\n')}catch(e){console.error('[App] web search error:',e)}}
      const api=window.electronAPI;
      console.log('[App] calling API, api available:',!!api);
      if(!api)throw new Error('Electron API not ready — please restart the app');
      let res;
      try{
        console.log('[App] trying queryStream');
        res=await api.queryStream({text:ctx,strategy,apiKeys:settings.apiKeys});
      }catch(e){
        console.warn('[App] queryStream failed, trying query:',e.message||e);
        res=await api.query({text:ctx,strategy,apiKeys:settings.apiKeys});
      }
      console.log('[App] got response:',JSON.stringify(res).slice(0,200));
      if(stop.current)return;
      setThk(res?.routing?.selected_models?.join(', ')||'');
      let cnt=(res?.responses||[]).map((r:any)=>r?.content||'').join('\n\n')||'';
      if(!cnt||cnt.trim().length===0){
        console.warn('[App] WARNING: empty response content');
        showToast('服务器返回空回复 — 请重试','warn');
        cnt='*[空回复] DeepSeek API 未返回内容，请重试或检查网络*';
      }
      console.log('[App] adding AI message, content length:',cnt.length);
      d(addMessage({sessionId:sid,message:{id:'a'+Date.now(),role:'assistant',content:cnt,timestamp:Date.now(),model:res?.routing?.selected_models?.join(', ')||'',routing:{intent:res?.routing?.top_intent,models:res?.routing?.selected_models||[],rationale:res?.routing?.rationale||''}}}));
    }catch(e:any){
      console.error('[App] query ERROR:',e.message||e,e.stack?.slice(0,200));
      showToast('连接失败: '+(e.message||'未知错误'),'error');
      d(addMessage({sessionId:sid,message:{id:'e'+Date.now(),role:'assistant',content:'Error: '+(e.message||'Connection failed'),timestamp:Date.now()}}));
    }
    d(setStreaming(false));setThk('');
  },[streaming,strategy,activeSessionId,d,fs,web,settings]);

  const send=()=>{const t=inp.trim();if(!t||streaming)return;query(t)}
  const cp=(c:string)=>{navigator.clipboard.writeText(c).catch(()=>{});setCid(c.slice(0,20));setTimeout(()=>setCid(''),1500)}
  const rg=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)query(u.content,true)}
  const em=(v:string)=>{if(!act)return;const a=[...act.messages].reverse().find(m=>m.role==='assistant');if(a)d(editMessage({sessionId:act.id,messageId:a.id,content:v}))}
  const br=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)d(branchSession({sourceSessionId:act.id,upToMessageId:u.id}))}
  const ex=()=>{if(!act||act.messages.length===0)return;const md2=act.messages.map(m=>`### ${m.role==='user'?'User':'Assistant'}\n\n${m.content}\n`).join('\n---\n');const b=new Blob([md2],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(act.name||'session')+'.md';a.click()}
  const dp=async(e:React.DragEvent)=>{e.preventDefault();setDrag(false);for(const f of Array.from(e.dataTransfer.files)){if(f.type.startsWith('image/')){const r=new FileReader();r.onload=()=>setFs(p=>[...p,{u:r.result as string,n:f.name}]);r.readAsDataURL(f);continue}try{const t=await f.text();setFs(p=>[...p,{u:'',n:f.name,t:t.slice(0,5000)}])}catch{}}}
  const useTpl=(prompt:string)=>{d(ns());setTimeout(()=>{setInp(prompt);ir.current?.focus();},100)}
  const handleCmd=(cmd:string)=>{if(cmd==='export')ex()}
  const confirmPlan=async()=>{if(!planId)return;const api=window.electronAPI;if(!api)return;setThk('Executing...');d(setStreaming(true));try{await api.plannerExecute(planId);setPlan(null);setPlanId('');setPlanProg(null);d(addMessage({sessionId:activeSessionId!,message:{id:'p'+Date.now(),role:'assistant',content:'Plan executed.',timestamp:Date.now(),model:'Planner'}}))}catch(e:any){d(addMessage({sessionId:activeSessionId!,message:{id:'e'+Date.now(),role:'assistant',content:'Failed: '+e.message,timestamp:Date.now()}}))}d(setStreaming(false));setThk('')}
  const rejectPlan=async()=>{const api=window.electronAPI;if(!api)return;await api.plannerReject(planId);setPlan(null);setPlanId('');setPlanProg(null)}
  const confInt=(card:any)=>{const api=window.electronAPI;if(api&&card.eventKey)api.monitorFeedback({eventKey:card.eventKey,accepted:true});setInterventions(p=>p.filter(c=>c.ts!==card.ts))}
  const dismInt=(card:any)=>{const api=window.electronAPI;if(api&&card.eventKey)api.monitorFeedback({eventKey:card.eventKey,accepted:false});setInterventions(p=>p.filter(c=>c.ts!==card.ts))}

  const SidebarContent=()=>{const[tab,setTab]=useState('chats');return(<div className="side"><div className="side-hd"><span className="side-logo">POLARIS</span><button className="side-cl"onClick={()=>d(toggleSidebar())}>&times;</button></div><div className="side-tabs"><button className={'side-tb'+(tab==='chats'?' on':'')}onClick={()=>setTab('chats')}>Sessions</button><button className={'side-tb'+(tab==='tools'?' on':'')}onClick={()=>setTab('tools')}>Tools</button></div><button className="side-new"onClick={()=>d(ns())}>+ New Session</button>
    {tab==='chats'&&<><div className="side-srch"><input placeholder="Search..."/></div><div className="side-list">{sessions.slice().reverse().map(s=>(<div key={s.id}className={'side-it'+(s.id===activeSessionId?' on':'')}onClick={()=>d(setActiveSession(s.id))}><span className="side-nm">{s.name||'New Session'}</span><span className="side-dt">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><button className="side-del"onClick={e=>{e.stopPropagation();d(deleteSession(s.id))}}>&times;</button></div>))}</div></>}
    {tab==='tools'&&<div className="side-section"><div className="side-section-title">Strategy</div><div className="side-strat-row">{(['best_quality','cost_optimized','ensemble']as Strategy[]).map(s=><button key={s}className={'side-strat'+(strategy===s?' on':'')}onClick={()=>d(setStrategy(s))}>{{best_quality:'Best',cost_optimized:'Cost',ensemble:'Ensemble'}[s]}</button>)}</div><div className="side-section-title">Shortcuts</div><div className="side-tpl-items">{[{k:'Ctrl+P',v:'Command Palette'},{k:'Ctrl+N',v:'New Session'},{k:'Ctrl+B',v:'Sidebar'},{k:'Ctrl+,',v:'Settings'},{k:'Enter',v:'Send'},{k:'Esc',v:'Stop'}].map(x=><div key={x.k}className="side-tpl-item">{x.k} — {x.v}</div>)}</div></div>}
    <div className="side-ft"><div className="side-ft-bar"><div className="side-ft-bar-fill"style={{width:pct+'%'}}/></div><span>{pct}%</span></div></div>);};

  const activeModel=sc.settings.apiKeys.anthropic?'Claude Sonnet':sc.settings.apiKeys.openai?'GPT-4o':'DeepSeek';

  return(<>
    {splash&&<div className={'splash'+(splashFade?' hidden':'')}><div className="splash-logo">POLARIS SOLVER</div><div className="splash-loader"><div className="splash-ring"/><div className="splash-ring"/><div className="splash-ring"/><div className="splash-dot"/></div></div>}
    {toasts.length>0&&<Toast toasts={toasts} onDone={(id:number)=>setToasts(p=>p.filter(t=>t.id!==id))}/>}
    <div className={"app"+(splash?'':' app-loaded')}onDragOver={e=>{e.preventDefault();setDrag(true)}}onDragLeave={()=>setDrag(false)}onDrop={dp}>
    <div className="tb"><div className="tb-l"><span className="tb-lg">Polaris</span><span className="tb-meta">v3</span><span className="tb-tokens">{contextTokens.used>0?Math.round(contextTokens.used/1000)+'k':''}</span></div><div className="tb-r"><button className="tb-btn"onClick={()=>d(toggleSidebar())}title="Sidebar (Ctrl+B)">☰</button><button className="tb-btn"onClick={()=>setCmd(true)}title="Command Palette (Ctrl+P)">⌘</button><button className="tb-btn"onClick={ex}title="Export">↓</button><button className="tb-btn"onClick={()=>d(toggleSettings())}title="Settings (Ctrl+,)">⚙</button><WinBtns/></div></div>
    {drag&&<div className="dov"><div className="doz"><p>Drop files to upload</p></div></div>}
    {fs.length>0&&<div className="fb">{fs.map((f,i)=><div key={i}className="fc"><span>{f.n}</span><button onClick={()=>setFs(p=>p.filter((_,j)=>j!==i))}className="fcx">&times;</button></div>)}</div>}

    <div className="body">
      {sidebarOpen&&<SidebarContent/>}
      <div className="main">
        <div className="chat"ref={cr}>
          {interventions.map(c=><IntCard key={c.ts||c.timestamp}card={c}onConfirm={confInt}onDismiss={dismInt}/>)}
          {plan&&<PlanCard plan={plan}onConfirm={confirmPlan}onReject={rejectPlan}progress={planProg}/>}
          {(!act||act.messages.length===0)?(<div className="empty"><h2>描述你的优化问题</h2><p className="eh">用自然语言描述优化问题（背包、排产、指派、调度⋯），Polaris 引擎自动求解</p><div className="esg">{SUGGESTIONS.map((s,i)=><button key={i}className="es"onClick={()=>{setInp(s);ir.current?.focus()}}>{s}</button>)}</div></div>):(act.messages.map((m,i)=><MsgRow key={m.id}msg={m}isLast={i===act.messages.length-1}onCopy={()=>cp(m.content)}onRegen={rg}onEdit={em}onBranch={br}cid={cid===m.content.slice(0,20)}/>))}
          {thk&&<div className="tm"><div className="tm-dots"><div className="tm-dot"/><div className="tm-dot"/><div className="tm-dot"/></div><span>{thk}</span></div>}
        </div>

        <div className="ia">
          {tpl&&<div className="tpp">{settings.promptTemplates.map(t=><button key={t.id}className="tpi"onClick={()=>{setInp(t.content);setTpl(false);ir.current?.focus()}}><span>{t.name}</span></button>)}</div>}
          <div className="ia-card">
            <div className="irr">
              <textarea ref={ir}className="itx"value={inp}onChange={e=>{setInp(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}if(e.key==='/'&&!inp){e.preventDefault();setCmd(true)}}}placeholder="描述优化问题... 例：背包容量50，价值60 100 120，重量10 20 30"rows={1}disabled={streaming}/>
              <div className="ia-actions">
                <button className={`ia-btn${web?' on':''}`}onClick={()=>setWeb(!web)}title="Web Search">⌖</button>
                <button className="ia-btn"onClick={async()=>{try{const{startListening}=await import('./utils/voice');startListening('zh-CN',(t:string)=>{setInp(p=>p+t)},()=>{})}catch{}}}disabled={streaming}title="Voice">♬</button>
                {streaming?<button className="ia-st"onClick={()=>{stop.current=true;d(setStreaming(false));setThk('')}}>■</button>:<button className="ia-send"onClick={send}disabled={!inp.trim()}>↑</button>}
              </div>
            </div>
            <div className="ia-status"><span>{'SOLVER'} &middot; {activeModel}</span><span>{web?'WEB':'READY'}</span></div>
          </div>
        </div>
      </div>
    </div>
    {settingsOpen&&<SettingsPanel/>}{cmd&&<CmdPalette onClose={()=>setCmd(false)} onCommand={handleCmd}/>}
  </div></>);
};

function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```mermaid\n([\s\S]*?)```/g,(_,c:string)=>'<div class="mdb">'+c.trim()+'</div>');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l:string,c:string)=>'<pre class="cb"><div class="cb-l">'+(l||'text')+'</div><code>'+hl(c.trim(),l)+'</code></pre>');h=h.replace(/`([^`]+)`/g,'<code>$1</code>');h=h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');h=h.replace(/\$\$(.+?)\$\$/g,(_,f:string)=>'<div class="lx">'+f+'</div>');h=h.replace(/\$(.+?)\$/g,(_,f:string)=>'<span class="li">'+f+'</span>');h=h.replace(/^### (.+)/gm,'<h3>$1</h3>');h=h.replace(/^## (.+)/gm,'<h2>$1</h2>');h=h.replace(/^# (.+)/gm,'<h1>$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li>$1</li>');h=h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');h=h.replace(/\n\n/g,'</p><p>');h=h.replace(/\n/g,'<br/>');return'<p>'+h+'</p>'}
function hl(c:string,l:string):string{const kw:Record<string,string[]>={js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except','raise','with','as','None','True','False'],ts:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this','interface','type','extends']};const w=kw[l]||[];let o=c;w.forEach(x=>{o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span class="hk">'+x+'</span>')});o=o.replace(/(\".*?\")/g,'<span class="hs">$1</span>');o=o.replace(/(\'.*?\')/g,'<span class="hs">$1</span>');o=o.replace(/(\/\/.*)/g,'<span class="hc">$1</span>');o=o.replace(/(\d+)/g,'<span class="hn">$1</span>');return o}
export default App;
