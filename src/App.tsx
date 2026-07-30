// @ts-nocheck
import React,{useState,useCallback,useRef,useEffect,useMemo}from'react';
import{useAppSelector,useAppDispatch}from'./store';
import{addMessage,editMessage,loadSessions as lr,newSession as ns,setActiveSession,setStreaming,setStrategy,toggleSidebar,toggleSettings,setTheme,deleteSession,branchSession,addMemory}from'./store/chatSlice';
import type{ChatMessage,Strategy}from'./store/chatSlice';
import{saveSessions,loadSessions as ld}from'./store/persist';
import SettingsPanel from'./components/SettingsPanel';
import{Button}from'./components/ui/button';
import{Card,CardContent}from'./components/ui/card';
import{Badge}from'./components/ui/badge';
import{Textarea}from'./components/ui/textarea';
import{Separator}from'./components/ui/separator';
import{ScrollArea}from'./components/ui/scroll-area';

const SUGGESTIONS=['背包容量50，3件物品价值60 100 120，重量10 20 30','排产5个任务，处理时间2 3 1 4 2','指派4个工人，成本10 2 8 7  5 12 3 6','车辆路径，5个客户，需求量1 2 1 3 2，车辆容量5'];

const Toast:React.FC<{toasts:any[];onDone:(id:number)=>void}>=({toasts,onDone})=>(
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
    {toasts.map(t=><div key={t.id} className={`animate-fade-in px-4 py-2.5 rounded-lg text-sm text-white max-w-[380px] shadow-lg ${t.type==='error'?'bg-destructive':t.type==='warn'?'bg-amber-500':'bg-primary'}`}>{t.msg}</div>)}
  </div>);

const MsgRow:React.FC<{msg:ChatMessage;isLast:boolean;onCopy:()=>void;onRegen:()=>void;onEdit:(v:string)=>void;onBranch:()=>void;onDownload:(code:string,name?:string)=>void;cid:boolean}>=({msg,isLast,onCopy,onRegen,onEdit,onBranch,onDownload,cid})=>{
  const[ed,setEd]=useState(false);const[v,setV]=useState(msg.content);const[rtOpen,setRtOpen]=useState(false);
  const dlRegex=/```(python|py|code)\n([\s\S]*?)```/g;const dlBlocks=[];let dm;while((dm=dlRegex.exec(msg.content))!==null)dlBlocks.push({lang:dm[1],code:dm[2].trim()});
  if(msg.role==='user')return(
    <div className="flex justify-end animate-fade-in"><div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm leading-relaxed shadow-sm">{msg.content}{msg.edited&&<span className="text-[10px] opacity-60 ml-1">(已编辑)</span>}</div></div>);
  return(
    <Card className="animate-fade-in">
      <CardContent className="p-4">
        {msg.routing && <div className="mb-2"><button className="text-[10px] text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-full hover:text-foreground transition-colors" onClick={()=>setRtOpen(!rtOpen)}>{rtOpen ? 'v' : '>'} {msg.routing.intent}</button>{rtOpen && <div className="mt-1 px-2 py-1 rounded-lg bg-muted text-[10px] text-muted-foreground font-mono inline-flex gap-1 flex-wrap"><span className="bg-primary/10 text-primary rounded-full px-1.5 font-medium">{msg.routing.intent}</span><span className="mx-1 text-muted-foreground/40">-></span>{msg.routing.models.map((m:any,i:number) => <span key={i} className="bg-muted-foreground/10 rounded-full px-1.5">{m}</span>)}</div>}</div>}
        {ed ? (<div><textarea className="w-full p-3 rounded-lg border bg-background text-sm resize-y outline-none focus:ring-2 focus:ring-ring min-h-[100px]" value={v} onChange={e=>setV(e.target.value)}/><div className="flex gap-2 mt-2"><Button size="sm" onClick={()=>{onEdit(v);setEd(false)}}>保存</Button><Button size="sm" variant="outline" onClick={()=>setEd(false)}>取消</Button></div></div>) : <div dangerouslySetInnerHTML={{__html:md(msg.content)}} className="text-sm leading-relaxed"/>}
        <div className="flex items-center justify-between mt-3 pt-2 border-t">
          <span className="text-[10px] text-muted-foreground font-mono">{msg.model||''}</span>
          <div className="flex gap-1">
            {dlBlocks.map((b,j)=><Button key={j} size="icon" variant="outline" className="h-7 w-7 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"onClick={()=>onDownload(b.code,b.lang==="py"?"polaris_model.py":"model.py")}>⬇</Button>)}
            <Button size="icon" variant="outline" className="h-7 w-7 border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400"onClick={()=>{const title=msg.content.slice(0,30).replace(/[\n\r*#]/g,'').trim()||'polaris';const api=window.electronAPI;if(api)api.toolsExecute({tool:'polaris_qiwen',params:{content:msg.content,title}})}}>◈</Button>
            <Button size="icon" variant="ghost" className="h-7 w-7"onClick={onCopy}>{cid?'✓':'⎘'}</Button>
            {isLast&&<><Button size="icon" variant="ghost" className="h-7 w-7"onClick={onRegen}>↺</Button><Button size="icon" variant="ghost" className="h-7 w-7"onClick={onBranch}>⑂</Button></>}
            <Button size="icon" variant="ghost" className="h-7 w-7"onClick={()=>{setEd(true);setV(msg.content)}}>✎</Button>
          </div>
        </div>
      </CardContent>
    </Card>);
};

const WinBtns=()=>(<div className="flex gap-1 ml-2"><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"onClick={()=>window.electronAPI?.minimize()}><svg width="10"height="1"viewBox="0 0 10 1"><rect width="10"height="1"rx=".5"fill="currentColor"/></svg></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"onClick={()=>window.electronAPI?.maximize()}><svg width="10"height="10"viewBox="0 0 10 10"><rect x=".5"y=".5"width="9"height="9"rx="1"fill="none"stroke="currentColor"strokeWidth="1"/></svg></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive hover:text-white"onClick={()=>window.electronAPI?.close()}><svg width="10"height="10"viewBox="0 0 10 10"><line x1="1"y1="1"x2="9"y2="9"stroke="currentColor"strokeWidth="1.2"strokeLinecap="round"/><line x1="9"y1="1"x2="1"y2="9"stroke="currentColor"strokeWidth="1.2"strokeLinecap="round"/></svg></Button></div>);

const App:React.FC=()=>{
  const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);
  const{sessions,activeSessionId,streaming,strategy,sidebarOpen,settingsOpen,settings,contextTokens}=sc;
  const[inp,setInp]=useState('');const[thk,setThk]=useState('');
  const cr=useRef<HTMLDivElement>(null);const ir=useRef<HTMLTextAreaElement>(null);
  const[fs,setFs]=useState<{u:string;n:string;t?:string}[]>([]);
  const[cid,setCid]=useState('');const[web,setWeb]=useState(false);
  const[drag,setDrag]=useState(false);const[cmd,setCmd]=useState(false);
  const[splash,setSplash]=useState(true);const[splashFade,setSplashFade]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>{setSplashFade(true);setTimeout(()=>setSplash(false),500)},2000);return()=>clearTimeout(t)},[]);
  const[toasts,setToasts]=useState<any[]>([]);
  const[execLog,setExecLog]=useState<{id:string;time:string;tool:string;status:'running'|'done'|'error';detail:string}[]>([]);
  const[todoSteps,setTodoSteps]=useState<{id:string;status:'pending'|'running'|'done';label:string}[]>([]);
  const addExecLog=(tool:string,status:'running'|'done'|'error',detail:string='')=>{const id=Date.now()+Math.random().toString(36);setExecLog(p=>[...p.slice(-30),{id,time:new Date().toLocaleTimeString(),tool,status,detail}]);if(status==='running'&&!sidebarOpen)d(toggleSidebar());if(status!=='running'){setTimeout(()=>setExecLog(p=>p.filter(e=>e.id!==id||e.status==='running'||p.slice(-3).some(x=>x.id===id))),8000)}};
  const showToast=(msg:string,type:string='error')=>{const id=Date.now();setToasts(p=>[...p.slice(-3),{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000)};
  const dispatchRef=useRef(d);dispatchRef.current=d;
  const stop=useRef(false);const act=sessions.find(s=>s.id===activeSessionId);
  const[interventions,setInterventions]=useState<any[]>([]);
  const[plan,setPlan]=useState<any>(null);const[planProg,setPlanProg]=useState<any>(null);const[planId,setPlanId]=useState('');
  const pct=contextTokens.total>0?Math.min(Math.round(contextTokens.used/Math.max(contextTokens.total,1)*100),100):0;

  useEffect(()=>{d(setTheme(settings.theme));const s=ld();if(s.length>0)d(lr(s))},[]);
  useEffect(()=>{if(sessions.length>0){const t=setTimeout(()=>saveSessions(sessions),500);return()=>clearTimeout(t)}},[sessions]);
  useEffect(()=>{cr.current?.scrollTo({top:cr.current.scrollHeight,behavior:'smooth'})},[act?.messages,thk,interventions]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='p'){e.preventDefault();setCmd(true)}if(e.key==='Escape'){stop.current=true;d(setStreaming(false));setThk('');setCmd(false)}if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();d(ns())}if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();d(toggleSidebar())}if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();d(toggleSettings())}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[d]);
  useEffect(()=>{const api=window.electronAPI;if(!api)return;api.monitorStart();api.onIntervention((card:any)=>{card.ts=Date.now();setInterventions(p=>[...p.slice(-4),card])});api.onPlanProgress((data:any)=>setPlanProg(data));api.onExecLog((d:any)=>{addExecLog(d.tool,d.status,d.detail||'')});api.onTodoUpdate((d:any)=>{if(d.steps)setTodoSteps(d.steps)});api.onStreamError((ed:any)=>{showToast('Stream Error: '+(ed?.message||'未知'),'error');dispatchRef.current(setStreaming(false));setThk('')});let kc=0;const onKb=()=>{kc++;if(kc%30===0)api.monitorUpdate({count:kc,lastPress:Date.now(),window:document.title})};window.addEventListener('keydown',onKb);return()=>window.removeEventListener('keydown',onKb)},[]);

  const query=useCallback(async(t:string,rgn?:boolean)=>{
    if(!t||streaming)return;stop.current=false;
    console.log('[App] query start:',t.slice(0,50));
    const sid=activeSessionId||'default';
    setInp('');setFs([]);
    if(!rgn){d(addMessage({sessionId:sid,message:{id:'u'+Date.now(),role:'user',content:t,timestamp:Date.now()}}))}
    d(setStreaming(true));setThk('分析中...');
    if(/优化|求解|排产|调度|指派|实验|对比|build|model|solve|benchmark|Benders|分解/.test(t)&&t.length>15){try{const api=window.electronAPI;if(api){const p=await api.plannerGenerate(t);setPlan(p);setPlanId(p.id);addExecLog('planner','running','正在分析任务...');if(!sidebarOpen)d(toggleSidebar())}}catch{}}
    try{
      let ctx=t;
      if(web){try{const{webSearch}=await import('./utils/search');const r=await webSearch(t,settings.apiKeys.serper);if(r.length>0&&!r[0].title.includes('not configured'))ctx+='\n[Web]\n'+r.map((x:any)=>'- '+x.title+': '+x.snippet).join('\n')}catch(e:any){console.error('[App] web search error:',e?.message||e)}}
      const api=window.electronAPI;if(!api)throw new Error('Electron API not ready');
      let res;
      try{res=await api.queryStream({text:ctx,strategy,apiKeys:settings.apiKeys})}catch(e:any){res=await api.query({text:ctx,strategy,apiKeys:settings.apiKeys})}
      if(stop.current)return;setThk(res?.routing?.selected_models?.join(', ')||'');
      let cnt=(res?.responses||[]).map((r:any)=>r?.content||'').join('\n\n')||'';
      if(!cnt||cnt.trim().length===0){showToast('服务器返回空回复','warn');cnt='*[空回复]*'}
      d(addMessage({sessionId:sid,message:{id:'a'+Date.now(),role:'assistant',content:cnt,timestamp:Date.now(),model:res?.routing?.selected_models?.join(', ')||'',routing:{intent:res?.routing?.top_intent,models:res?.routing?.selected_models||[],rationale:res?.routing?.rationale||''}}}));
    }catch(e:any){showToast('连接失败: '+(e.message||'未知错误'),'error');d(addMessage({sessionId:sid,message:{id:'e'+Date.now(),role:'assistant',content:'Error: '+(e.message||'Connection failed'),timestamp:Date.now()}}))}
    d(setStreaming(false));setThk('');
  },[streaming,strategy,activeSessionId,d,fs,web,settings]);

  const send=()=>{const t=inp.trim();if(!t||streaming)return;query(t)}
  const cp=(c:string)=>{navigator.clipboard.writeText(c).catch(()=>{});setCid(c.slice(0,20));setTimeout(()=>setCid(''),1500)}
  const rg=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)query(u.content,true)}
  const em=(v:string)=>{if(!act)return;const a=[...act.messages].reverse().find(m=>m.role==='assistant');if(a)d(editMessage({sessionId:act.id,messageId:a.id,content:v}))}
  const br=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)d(branchSession({sourceSessionId:act.id,upToMessageId:u.id}))}
  const ex=()=>{if(!act||act.messages.length===0)return;const md2=act.messages.map(m=>`### ${m.role==='user'?'User':'Assistant'}\n\n${m.content}\n`).join('\n---\n');const b=new Blob([md2],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(act.name||'session')+'.md';a.click()}
  const confirmPlan=async()=>{if(!planId)return;const api=window.electronAPI;if(!api)return;setThk('Executing...');d(setStreaming(true));try{await api.plannerExecute(planId);setPlan(null);setPlanId('');setPlanProg(null);d(addMessage({sessionId:activeSessionId!,message:{id:'p'+Date.now(),role:'assistant',content:'Plan executed.',timestamp:Date.now(),model:'Planner'}}))}catch(e:any){d(addMessage({sessionId:activeSessionId!,message:{id:'e'+Date.now(),role:'assistant',content:'Failed: '+e.message,timestamp:Date.now()}}))}d(setStreaming(false));setThk('')}
  const rejectPlan=async()=>{const api=window.electronAPI;if(!api)return;await api.plannerReject(planId);setPlan(null);setPlanId('');setPlanProg(null)}
  const confInt=(card:any)=>{const api=window.electronAPI;if(api&&card.eventKey)api.monitorFeedback({eventKey:card.eventKey,accepted:true});setInterventions(p=>p.filter(c=>c.ts!==card.ts))}
  const dismInt=(card:any)=>{const api=window.electronAPI;if(api&&card.eventKey)api.monitorFeedback({eventKey:card.eventKey,accepted:false});setInterventions(p=>p.filter(c=>c.ts!==card.ts))}

  const activeModel=sc.settings.apiKeys.anthropic?'Claude Sonnet':sc.settings.apiKeys.openai?'GPT-4o':'DeepSeek';

  if(splash)return(
    <div className={`fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-8 transition-opacity duration-500 ${splashFade?'opacity-0 pointer-events-none':''}`}>
      <div className="font-mono text-xl font-semibold text-primary tracking-wide opacity-0 translate-y-2 animate-fade-in"style={{animationDelay:'0.2s',animationFillMode:'forwards'}}>POLARIS SOLVER</div>
      <div className="relative w-[120px] h-[120px]">
        <div className="absolute inset-0 border-2 border-transparent border-t-primary rounded-full animate-converge"/>
        <div className="absolute top-[15px] left-[15px] w-[90px] h-[90px] border-2 border-transparent border-r-muted-foreground rounded-full animate-converge"style={{animationDelay:'0.5s'}}/>
        <div className="absolute top-[30px] left-[30px] w-[60px] h-[60px] border-2 border-transparent border-b-emerald-500 rounded-full animate-converge"style={{animationDelay:'1s'}}/>
        <div className="absolute top-[57px] left-[57px] w-[6px] h-[6px] rounded-full bg-primary animate-pulse-dot"/>
      </div>
    </div>);

  return(<>
    {toasts.length>0&&<Toast toasts={toasts} onDone={(id:number)=>setToasts(p=>p.filter(t=>t.id!==id))}/>}
    <div className="flex flex-col h-screen overflow-hidden bg-background animate-fade-in">
      {/* Titlebar */}
      <div className="flex items-center justify-between h-10 px-4 bg-card border-b shrink-0 drag">
        <div className="flex items-baseline gap-3 no-drag"><span className="text-sm font-semibold font-mono tracking-tight">Polaris</span><Badge variant="secondary" className="text-[9px] font-mono">v3</Badge></div>
        <div className="flex items-center gap-1 no-drag">
          <Button variant="ghost" size="icon" className="h-7 w-7"onClick={()=>d(toggleSidebar())}>☰</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"onClick={()=>setCmd(true)}>⌘</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"onClick={ex}>↓</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"onClick={()=>d(toggleSettings())}>⚙</Button>
          <WinBtns/>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen&&<Sidebar sessions={sessions} activeId={activeSessionId} execLog={execLog} todoSteps={todoSteps} pct={pct} onSelect={(id:any)=>d(setActiveSession(id))} onNew={()=>d(ns())} onDelete={(id)=>d(deleteSession(id))} onClose={()=>d(toggleSidebar())}/>}

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <ScrollArea className="flex-1 p-6" ref={cr}>
            <div className="flex flex-col gap-4">
              {interventions.map(c=><IntCard key={c.ts}card={c}onConfirm={confInt}onDismiss={dismInt}/>)}
              {plan&&<PlanCard plan={plan}onConfirm={confirmPlan}onReject={rejectPlan}progress={planProg}/>}
              {(!act||act.messages.length===0)?(
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
                  <h2 className="text-2xl font-semibold font-mono bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">描述你的优化问题</h2>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">用自然语言描述优化问题（背包、排产、指派、调度⋯），Polaris 引擎自动求解</p>
                  <div className="flex flex-wrap gap-2 mt-3 justify-center max-w-[560px]">{SUGGESTIONS.map((s,i)=><Button key={i} variant="outline" size="sm" className="rounded-full text-xs"onClick={()=>{setInp(s);ir.current?.focus()}}>{s}</Button>)}</div>
                </div>
              ):(act.messages.map((m,i)=><MsgRow key={m.id}msg={m}isLast={i===act.messages.length-1}onDownload={(code:string,name?:string)=>{const b=new Blob([code],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name||"model.py";a.click()}}onCopy={()=>cp(m.content)}onRegen={rg}onEdit={em}onBranch={br}cid={cid===m.content.slice(0,20)}/>))}
              {thk&&<div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground font-mono bg-card border rounded-xl shadow-sm animate-fade-in"><div className="flex gap-1">{Array.from({length:3}).map((_,i)=><div key={i}className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot"style={{animationDelay:`${i*0.2}s`}}/>)}</div><span>{thk}</span></div>}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 pb-5 shrink-0">
            <div className="rounded-2xl bg-card shadow-sm border focus-within:ring-2 focus-within:ring-ring transition-shadow">
              <div className="flex items-end gap-0 px-2 py-1">
                <Textarea ref={ir} className="flex-1 bg-transparent border-0 shadow-none text-sm leading-relaxed max-h-[160px] min-h-[24px] focus-visible:ring-0"value={inp}onChange={e=>{setInp(e.target.value)}}onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}if(e.key==='/'&&!inp){e.preventDefault();setCmd(true)}}}placeholder="描述优化问题... 例：背包容量50，价值60 100 120，重量10 20 30"rows={1}disabled={streaming}/>
                <div className="flex items-center gap-1 py-1 pr-1 shrink-0">
                  <Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full ${web?'text-primary bg-primary/10':''}`}onClick={()=>setWeb(!web)}>⌖</Button>
                  {streaming?<Button variant="destructive" size="icon" className="h-9 w-9 rounded-full"onClick={()=>{stop.current=true;d(setStreaming(false));setThk('')}}>■</Button>:<Button size="icon" className="h-9 w-9 rounded-full"onClick={send}disabled={!inp.trim()}>↑</Button>}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-1 text-[9px] text-muted-foreground font-mono border-t">
                <span>{'SOLVER'} · {activeModel}</span><span>{web?'WEB':'READY'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {settingsOpen&&<SettingsPanel/>}
    {cmd&&<CmdPalette onClose={()=>setCmd(false)} onCommand={(cmd:string)=>{if(cmd==='export')ex()}}/>}
  </>);
};

// ── Sidebar ──
function Sidebar({sessions,activeId,execLog,todoSteps,pct,onSelect,onNew,onDelete,onClose}:any){
  const[tab,setTab]=useState('chats');
  const statusIcons:{[k:string]:string}={running:'●',done:'✓',error:'✗'};
  const statusColors:{[k:string]:string}={running:'text-primary',done:'text-emerald-500',error:'text-destructive'};
  return(
    <div className="w-[272px] shrink-0 bg-card border-r flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3"><span className="text-xs font-semibold font-mono tracking-tight">POLARIS</span><Button variant="ghost" size="icon" className="h-6 w-6"onClick={onClose}>×</Button></div>
      <div className="flex px-3 gap-0.5">
        {['chats','exec','tasks','tools'].map(t=><button key={t} className={`flex-1 py-2 text-[11px] font-medium rounded-md transition-colors ${tab===t?'bg-primary/10 text-primary':'text-muted-foreground hover:text-foreground'}`}onClick={()=>setTab(t)}>{t==='chats'?'会话':t==='exec'?'Exec':t==='tasks'?'Tasks':'工具'}{t==='exec'&&execLog.some((e:any)=>e.status==='running')&&<span className="text-primary ml-1">●</span>}{t==='tasks'&&todoSteps.some((s:any)=>s.status==='running')&&<span className="text-amber-500 ml-1">●</span>}</button>)}
      </div>
      <Button variant="ghost" className="mx-3 my-1 text-xs text-muted-foreground"onClick={onNew}>+ 新会话</Button>
      <Separator/>
      <ScrollArea className="flex-1 px-2 py-1">
        {tab==='chats'&&sessions.slice().reverse().map((s:any)=><div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${s.id===activeId?'bg-primary/10 text-primary font-medium':'text-muted-foreground hover:bg-muted'}`}onClick={()=>onSelect(s.id)}><span className="flex-1 truncate">{s.name||'新会话'}</span><span className="text-[9px] text-muted-foreground font-mono">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><button className="opacity-0 hover:opacity-100 text-destructive text-[10px] px-1 rounded hover:bg-destructive/10"onClick={e=>{e.stopPropagation();onDelete(s.id)}}>×</button></div>)}
        {tab==='exec'&&(execLog.length===0?<p className="text-[10px] text-muted-foreground p-2">等待工具调用...</p>:execLog.slice().reverse().map((e:any)=><div key={e.id} className={'flex gap-2 px-2 py-1 text-[10px] font-mono'}><span className={statusColors[e.status]+' shrink-0'}>{statusIcons[e.status]}</span><span className="flex-1"><span className="font-medium text-foreground">{e.tool}</span><span className="text-muted-foreground ml-1">{e.time}</span><br/><span className="text-muted-foreground break-all">{e.detail}</span></span></div>))}
        {tab==='tasks'&&(todoSteps.length===0?<p className="text-[10px] text-muted-foreground p-2">暂无任务...</p>:todoSteps.map((t:any)=><div key={t.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px]"><span className={statusColors[t.status]}>{statusIcons[t.status]}</span><span className={(t.status==='running'?'font-semibold text-foreground':'text-muted-foreground')}>{t.label}</span></div>)}
        {tab==='tools'&&<div className="flex flex-col gap-0.5 p-1">{['polaris_opt','polaris_analyze','polaris_research','polaris_model','polaris_remember','polaris_paper','polaris_literature','polaris_code'].map(t=><div key={t} className="px-3 py-1.5 text-[10px] text-muted-foreground font-mono hover:text-foreground rounded cursor-pointer">{t}</div>)}</div>}
      </ScrollArea>
      <div className="flex items-center gap-2 px-3 py-2.5 border-t text-[9px] text-muted-foreground font-mono"><div className="w-12 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-300"style={{width:pct+'%'}}/></div><span>{pct}%</span></div>
    </div>);
}

// ── Minor components ──
function IntCard({card,onConfirm,onDismiss}:any){return(<Card className={`p-3 text-xs animate-fade-in ${card.level===3?'border-l-2 border-destructive':card.level===1?'border-l-2 border-emerald-500':''}`}><div className="flex items-center gap-3"><span className="flex-1 text-muted-foreground">{card.body}</span><div className="flex gap-2"><Button size="sm" variant="outline" className="h-7 text-[10px]"onClick={()=>onConfirm(card)}>接受</Button><Button size="sm" variant="ghost" className="h-7 text-[10px]"onClick={()=>onDismiss(card)}>忽略</Button></div></div></Card>);}
function PlanCard({plan,onConfirm,onReject,progress}:any){return(<Card className="p-4 animate-fade-in"><div className="flex items-center gap-2 mb-2"><span className="font-semibold text-sm">{plan.workflow||'计划'}</span></div><p className="text-[11px] text-muted-foreground mb-3">{plan.request?.slice(0,80)}</p><div className="flex flex-col gap-1 mb-3">{plan.steps?.map((s:any)=><div key={s.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${progress&&progress.step===s.id?'bg-primary/10 text-primary font-medium':progress&&progress.step===s.id&&progress.type==='step_done'?'opacity-40':'text-muted-foreground'}`}><span className="font-mono text-xs w-4 text-center">{progress&&progress.step===s.id&&progress.type==='step_done'?'✓':progress&&progress.step===s.id?'●':'○'}</span><span>{s.description}</span></div>)}</div><div className="flex gap-2">{!progress?<><Button size="sm"onClick={onConfirm}>执行</Button><Button size="sm" variant="outline"onClick={onReject}>取消</Button></>:<Button size="sm" variant="outline"onClick={onReject}>停止</Button>}</div></Card>);}
function CmdPalette({onClose,onCommand}:any){const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);const[q,setQ]=useState('');const cmds=[{id:'quality',l:'Best Quality',a:()=>{d(setStrategy('best_quality'));onClose()}},{id:'new',l:'New Session',a:()=>{d(ns());onClose()}},{id:'sidebar',l:'Toggle Sidebar',a:()=>{d(toggleSidebar());onClose()}},{id:'settings',l:'Settings',a:()=>{d(toggleSettings());onClose()}},{id:'export',l:'Export',a:()=>{onCommand('export');onClose()}}].filter(x=>!q||x.l.toLowerCase().includes(q.toLowerCase()));return(<div className="fixed inset-0 z-[300] bg-black/10 backdrop-blur-sm flex items-start justify-center pt-40 animate-fade-in"onClick={onClose}><div className="bg-card border rounded-xl w-[440px] max-w-[92vw] overflow-hidden shadow-xl"onClick={e=>e.stopPropagation()}><input className="w-full px-4 py-3 bg-transparent border-b text-sm outline-none font-sans"autoFocus value={q}onChange={e=>setQ(e.target.value)}placeholder="搜索命令..."/><div className="max-h-[260px] overflow-auto p-1">{cmds.map(c=><div key={c.id} className="px-4 py-2.5 cursor-pointer text-sm text-muted-foreground hover:bg-muted hover:text-foreground rounded-md flex justify-between"onClick={c.a}><span>{c.l}</span></div>)}</div></div></div>);}

function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l:string,c:string)=>`<pre class="bg-muted p-3 rounded-lg overflow-x-auto my-2 text-xs font-mono leading-relaxed border"><code>${hl(c.trim(),l)}</code></pre>`);h=h.replace(/`([^`]+)`/g,'<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono text-primary">$1</code>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong class="font-semibold">$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em class="text-muted-foreground">$1</em>');h=h.replace(/^### (.+)/gm,'<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>');h=h.replace(/^## (.+)/gm,'<h2 class="text-base font-semibold mt-4 mb-2">$1</h2>');h=h.replace(/^# (.+)/gm,'<h1 class="text-lg font-bold mt-4 mb-2 pb-1 border-b">$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li class="ml-4 text-sm">$1</li>');h=h.replace(/\n\n/g,'<br/><br/>');h=h.replace(/\n/g,'<br/>');return`<p>${h}</p>`}
function hl(c:string,l:string):string{const kw:Record<string,string[]>={js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except']};const w=kw[l]||[];let o=c;w.forEach(x=>{o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span class="text-primary font-medium">'+x+'</span>')});o=o.replace(/(\".*?\")/g,'<span class="text-amber-500">$1</span>');o=o.replace(/(\d+)/g,'<span class="text-violet-500">$1</span>');return o}
export default App;
