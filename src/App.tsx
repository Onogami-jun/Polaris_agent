// @ts-nocheck
import React,{useState,useCallback,useRef,useEffect}from'react';
import{useAppSelector,useAppDispatch}from'./store';
import{addMessage,editMessage,loadSessions as lr,newSession as ns,setActiveSession,setStreaming,setStrategy,toggleSettings,setTheme,deleteSession,branchSession,setEngineStatus}from'./store/chatSlice';
import{restoreAuth,incrementUsage,openLoginModal,logoutUser}from'./store/authSlice';
import{saveSessions,loadSessions as ld}from'./store/persist';
import SettingsPanel from'./components/SettingsPanel';
import{LoginModal}from'./components/LoginModal';
import{AuthBanner}from'./components/AuthBanner';
import{SandboxHealthPanel}from'./components/SandboxWizard';
import{Button}from'./components/ui/button';
import{Badge}from'./components/ui/badge';
import{Separator}from'./components/ui/separator';
import{ScrollArea}from'./components/ui/scroll-area';
import{
  Conversation,ConversationEmpty,
  MessageList,
  Message,
  MessageInput,WebSearchButton,
  MessageActions,CopyButton,RetryButton,EditButton,BranchButton,DownloadButton,
  Thinking,Reasoning,
  SuggestionsList
}from'./components/ai';

const SUGGESTIONS=['背包容量50，3件物品价值60 100 120，重量10 20 30','排产5个任务，处理时间2 3 1 4 2','指派4个工人，成本10 2 8 7  5 12 3 6','车辆路径，5个客户，需求量1 2 1 3 2，车辆容量5'];

/* ── Splash ── */
const Splash=({fade}:{fade:boolean})=>(
  <div className={'fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-10 bg-background transition-opacity duration-500 '+ (fade?'opacity-0 pointer-events-none':'')}>
    <div className="font-mono text-xl font-semibold tracking-widest text-primary animate-fade-in-bright">POLARIS SOLVER</div>
    <div className="relative w-[120px] h-[120px]">
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-converge"/>
      <div className="absolute top-[15px] left-[15px] w-[90px] h-[90px] rounded-full border-2 border-transparent border-r-muted-foreground animate-converge"style={{animationDelay:'0.4s',animationDuration:'2.5s'}}/>
      <div className="absolute top-[30px] left-[30px] w-[60px] h-[60px] rounded-full border-2 border-transparent border-b-emerald-500 animate-converge"style={{animationDelay:'0.8s',animationDuration:'2s'}}/>
      <div className="absolute top-[57px] left-[57px] w-[6px] h-[6px] rounded-full bg-primary animate-pulse-dot"/>
    </div>
    <div className="text-[10px] text-muted-foreground font-mono tracking-widest">BITWOOL STUDIO</div>
  </div>);

/* ── Win Buttons ── */
const WinBtns=()=>(
  <div className="flex gap-2 ml-3">
    <button onClick={()=>window.electronAPI?.minimize()} className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-300 transition-colors"/>
    <button onClick={()=>window.electronAPI?.maximize()} className="w-3 h-3 rounded-full bg-emerald-400 hover:bg-emerald-300 transition-colors"/>
    <button onClick={()=>window.electronAPI?.close()} className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-300 transition-colors"/>
  </div>);

/* ── Toast ── */
const ToastC:React.FC<{toasts:any[]}>=({toasts})=>(
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
    {toasts.map(t=><div key={t.id} className={'animate-fade-in px-4 py-2.5 rounded-lg text-sm text-white max-w-[380px] shadow-lg '+ (t.type==='error'?'bg-destructive':t.type==='warn'?'bg-amber-500':'bg-primary')}>{t.msg}</div>)}
  </div>);

/* ── Markdown ── */
function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l:string,c:string)=>'<pre className="bg-muted p-4 rounded-lg overflow-x-auto my-3 text-xs font-mono leading-relaxed border border-border"><code>'+hl(c.trim(),l)+'</code></pre>');h=h.replace(/`([^`]+)`/g,'<code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">$1</code>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong className="font-semibold">$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em className="text-muted-foreground">$1</em>');h=h.replace(/^### (.+)/gm,'<h3 className="text-sm font-semibold mt-4 mb-2">$1</h3>');h=h.replace(/^## (.+)/gm,'<h2 className="text-base font-semibold mt-5 mb-3">$1</h2>');h=h.replace(/^# (.+)/gm,'<h1 className="text-lg font-bold mt-5 mb-3 pb-2 border-b border-border">$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li className="ml-4 text-sm">$1</li>');h=h.replace(/\n\n/g,'<br/><br/>');h=h.replace(/\n/g,'<br/>');return'<p>'+h+'</p>';}
function hl(c:string,l:string):string{const kw:Record<string,string[]>={js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except']};const w=kw[l]||[];let o=c;w.forEach(x=>{o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span className="text-primary font-medium">'+x+'</span>')});o=o.replace(/(\".*?\")/g,'<span className="text-amber-500">$1</span>');o=o.replace(/(\d+)/g,'<span className="text-violet-500">$1</span>');return o;}

/* ─────────────────────────────────────────────────
   WORKFLOW VIEW — real-time sidebar panel
   Shows: Plan steps + Execution log + Task status
   ───────────────────────────────────────────────── */
function WorkflowView({plan,planProg,planId,execLog,todoSteps,onConfirmPlan,onRejectPlan,onStopPlan}:any){
  // Build unified step list from planner + exec log + todo
  const hasPlan=!!plan;
  const isExecuting=!!planProg;

  return(
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">工作流</span>
          {isExecuting&&<span className="flex gap-0.5"><span className="h-1 w-1 rounded-full bg-primary animate-pulse-dot"/><span className="h-1 w-1 rounded-full bg-primary animate-pulse-dot"style={{animationDelay:'0.2s'}}/><span className="h-1 w-1 rounded-full bg-primary animate-pulse-dot"style={{animationDelay:'0.4s'}}/></span>}
        </div>
      </div>
      <Separator/>

      <ScrollArea className="flex-1">
        <div className="px-2 py-2 space-y-1">
          {/* ── Plan Steps (when planner is active) ── */}
          {hasPlan&&plan.steps&&plan.steps.map((s:any)=>{
            let status='pending';
            let statusIcon='○';
            let statusColor='text-muted-foreground/40';
            let bg='';
            if(planProg){
              if(planProg.type==='step_done'&&planProg.step===s.id){status='done';statusIcon='✓';statusColor='text-emerald-500';bg='bg-emerald-500/5';}
              else if(planProg.step===s.id&&planProg.type==='step_start'){status='running';statusIcon='●';statusColor='text-primary';bg='bg-primary/5 border border-primary/20';}
              else if(planProg.type==='step_error'&&planProg.step===s.id){status='error';statusIcon='✗';statusColor='text-destructive';bg='bg-destructive/5';}
            }
            return(
              <div key={s.id} className={'flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-300 '+bg}>
                <span className={'font-mono text-[11px] w-4 text-center shrink-0 mt-0.5 '+statusColor}>{statusIcon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-foreground leading-tight">{s.description}</div>
                  <div className="text-[9px] text-muted-foreground font-mono mt-0.5">{s.agent||'agent'}</div>
                </div>
              </div>
            );
          })}

          {/* ── Exec Log (tool calls) ── */}
          {execLog&&execLog.length>0&&
            <div className="contents">
              <div className="pt-3 pb-1">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono px-2">工具调用</span>
              </div>
              {execLog.slice(-20).reverse().map((e:any)=>{
                const icon={running:'●',done:'✓',error:'✗'}[e.status]||'○';
                const clr={running:'text-primary',done:'text-emerald-500',error:'text-destructive'}[e.status]||'text-muted-foreground';
                return <div key={e.id} className="flex items-start gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
                    <span className={'font-mono text-[10px] w-3 text-center shrink-0 '+clr}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-foreground font-mono">{e.tool}</span>
                        <span className="text-[8px] text-muted-foreground/50">{e.time}</span>
                      </div>
                      {e.detail&&<div className="text-[9px] text-muted-foreground truncate mt-0.5">{e.detail}</div>}
                    </div>
                  </div>
              })}
            </div>
          }

          {/* ── Todo Steps ── */}
          {todoSteps&&todoSteps.length>0&&
            <div className="contents">
              <div className="pt-3 pb-1">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono px-2">任务</span>
              </div>
              {todoSteps.map((t:any)=>{
                const icon={running:'●',done:'✓',pending:'○'}[t.status]||'○';
                const clr={running:'text-primary',done:'text-emerald-500',pending:'text-muted-foreground/40'}[t.status]||'text-muted-foreground';
                return <div key={t.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className={'font-mono text-[10px] '+clr}>{icon}</span>
                    <span className={t.status==='running'?'text-[10px] font-medium text-foreground':'text-[10px] text-muted-foreground'}>{t.label}</span>
                  </div>
              })}
            </div>
          }

          {/* ── Idle state ── */}
          {!hasPlan&&(!execLog||execLog.length===0)&&(!todoSteps||todoSteps.length===0)&&(
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground/50">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/>
                  <polygon points="8,5 8,8 10,10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[10px] text-muted-foreground/60 font-mono">等待任务...</p>
              <p className="text-[9px] text-muted-foreground/40 max-w-[180px]">描述优化问题后，工作流进度将在此实时显示</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Plan actions (when pending confirmation) ── */}
      {hasPlan&&!isExecuting&&(
        <div className="px-3 py-2.5 border-t border-border bg-card">
          <p className="text-[10px] text-muted-foreground mb-2 font-mono">{plan.request?.slice(0,60)}</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-7 text-[10px]"onClick={onConfirmPlan}>执行计划</Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]"onClick={onRejectPlan}>取消</Button>
          </div>
        </div>
      )}

      {/* ── Stop button (during execution) ── */}
      {isExecuting&&(
        <div className="px-3 py-2.5 border-t border-border bg-card">
          <Button size="sm" variant="outline" className="w-full h-7 text-[10px]"onClick={onStopPlan}>停止执行</Button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   LEFT SIDEBAR — conversations + token
   ───────────────────────────────────────────────── */
function LeftSidebar({sessions,activeId,pct,onSelect,onNew,onDelete,onOpenSettings,width}:any){
  const auth = useAppSelector(s=>s.auth);
  const engine = useAppSelector(s=>s.chat.engineStatus);
  const d = useAppDispatch();
  return(
    <div style={{width:width}} className="shrink-0 bg-card border-r border-border flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">会话</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={onNew} title="新建会话">+</Button>
      </div>
      <Separator/>
      <ScrollArea className="flex-1 px-2 py-1">
        {sessions.slice().reverse().map((s:any)=>
          <div key={s.id} className={'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors group '+ (s.id===activeId?'bg-primary/10 text-primary font-medium':'text-muted-foreground hover:bg-muted hover:text-foreground')} onClick={()=>onSelect(s.id)}>
            <span className="flex-1 truncate">{s.name||'新会话'}</span>
            <span className="text-[8px] text-muted-foreground font-mono opacity-0 group-hover:opacity-40 shrink-0">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            <button className="opacity-0 group-hover:opacity-100 text-destructive text-[10px] px-1 rounded hover:bg-destructive/10 shrink-0" onClick={e=>{e.stopPropagation();onDelete(s.id)}}>×</button>
          </div>
        )}
      </ScrollArea>
      <Separator/>
      {/* Token usage */}
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-muted-foreground font-mono">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-500"style={{width:pct+'%'}}/></div>
      </div>
      {/* Engine status */}
      <div className="px-3 py-1.5 space-y-1 text-[9px] font-mono">
        <div className="flex items-center justify-between"><span className="text-muted-foreground/50">Python</span><span className={engine.python?'text-emerald-500':'text-destructive'}>{engine.python?'✓':'✗'}</span></div>
        <div className="flex items-center justify-between"><span className="text-muted-foreground/50">polaris-opt</span><span className={engine.polaris?'text-emerald-500':'text-destructive'}>{engine.polaris?'✓':'✗'}</span></div>
        <div className="flex items-center justify-between"><span className="text-muted-foreground/50">DeepSeek</span><span className={engine.deepseek?'text-emerald-500':'text-destructive'}>{engine.deepseek?'✓':'✗'}</span></div>
        {!engine.polaris && <div className="text-[8px] text-muted-foreground/40 text-center pt-0.5">pip install polaris-opt[highs]</div>}
      </div>
      {/* Settings + Login buttons */}
      <div className="px-2 py-1.5 space-y-1 border-t border-border">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2"/></svg>
          <span>设置</span>
        </button>
        {auth.user ? (
          <button onClick={() => d(logoutUser())} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{background:auth.user.avatar}}>{auth.user.displayName.slice(0,1).toUpperCase()}</div>
            <span className="truncate">{auth.user.displayName}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/50">登出</span>
          </button>
        ) : (
          <button onClick={() => d(openLoginModal())} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
            <span>登录 BitWool</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   RIGHT SIDEBAR — workflow real-time view
   ───────────────────────────────────────────────── */
function RightSidebar({execLog,todoSteps,plan,planProg,planId,onConfirmPlan,onRejectPlan,onStopPlan,width}:any){
  return(
    <div style={{width:width}} className="shrink-0 bg-card border-l border-border flex flex-col h-full overflow-hidden">
      <SandboxHealthPanel/>
      <Separator/>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <WorkflowView
          plan={plan} planProg={planProg} planId={planId}
          execLog={execLog} todoSteps={todoSteps}
          onConfirmPlan={onConfirmPlan} onRejectPlan={onRejectPlan} onStopPlan={onStopPlan}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   APP
   ───────────────────────────────────────────────── */
const App:React.FC=()=>{
  const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);
  const{sessions,activeSessionId,streaming,strategy,settingsOpen,settings,contextTokens}=sc;
  const[inp,setInp]=useState('');const[thk,setThk]=useState('');
  const[fs,setFs]=useState<{u:string;n:string;t?:string}[]>([]);
  const[cid,setCid]=useState('');const[web,setWeb]=useState(false);
  const[cmd,setCmd]=useState(false);
  const[splash,setSplash]=useState(true);const[splashFade,setSplashFade]=useState(false);
  const[toasts,setToasts]=useState<any[]>([]);
  const[execLog,setExecLog]=useState<{id:string;time:string;tool:string;status:'running'|'done'|'error';detail:string}[]>([]);
  const[todoSteps,setTodoSteps]=useState<{id:string;status:'pending'|'running'|'done';label:string}[]>([]);
  const[interventions,setInterventions]=useState<any[]>([]);
  const[plan,setPlan]=useState<any>(null);const[planProg,setPlanProg]=useState<any>(null);const[planId,setPlanId]=useState('');

  // Panel widths (px) & visibility
  const[leftW,setLeftW]=useState(220);const[leftOpen,setLeftOpen]=useState(true);
  const[rightW,setRightW]=useState(280);const[rightOpen,setRightOpen]=useState(true);

  const dispatchRef=useRef(d);const stop=useRef(false);
  const act=sessions.find(s=>s.id===activeSessionId);
  const pct=contextTokens.total>0?Math.min(Math.round(contextTokens.used/Math.max(contextTokens.total,1)*100),100):0;

  // ── Init ──
  useEffect(()=>{const t=setTimeout(()=>{setSplashFade(true);setTimeout(()=>setSplash(false),500)},2200);return()=>clearTimeout(t)},[]);
  useEffect(()=>{document.documentElement.classList.toggle('dark',settings.theme==='dark');document.documentElement.style.fontSize=settings.fontSize+'px';d(restoreAuth());const s=ld();if(s.length>0)d(lr(s))},[]);
  useEffect(()=>{if(sessions.length>0){const t=setTimeout(()=>saveSessions(sessions),500);return()=>clearTimeout(t)}},[sessions]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='p'){e.preventDefault();setCmd(true)}if(e.key==='Escape'){stop.current=true;d(setStreaming(false));setThk('');setCmd(false)}if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();d(ns())}if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();d(toggleSettings())}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[d]);
  useEffect(()=>{const api=window.electronAPI;if(!api)return;api.monitorStart();api.onIntervention((card:any)=>{card.ts=Date.now();setInterventions(p=>[...p.slice(-4),card])});api.onPlanProgress((data:any)=>setPlanProg(data));api.onExecLog((data:any)=>{addExecLog(data.tool,data.status,data.detail||'')});api.onTodoUpdate((data:any)=>{if(data.steps)setTodoSteps(data.steps)});api.onStreamError((ed:any)=>{showToast('Stream Error: '+(ed?.message||'未知'),'error');dispatchRef.current(setStreaming(false));setThk('')});
  // Health check
  api.healthCheck().then((r:any)=>{if(Array.isArray(r)){const s={python:false,polaris:false,highs:false,deepseek:false};r.forEach((x:any)=>{if(x.service==='Python')s.python=x.ok;if(x.service==='Polaris Engine')s.polaris=x.ok;if(x.service==='HiGHS Solver')s.highs=x.ok;if(x.service==='DeepSeek API')s.deepseek=x.ok;});d(setEngineStatus(s))}}).catch(()=>{});
  let kc=0;const onKb=()=>{kc++;if(kc%30===0)api.monitorUpdate({count:kc,lastPress:Date.now(),window:document.title})};window.addEventListener('keydown',onKb);return()=>window.removeEventListener('keydown',onKb)},[]);
  useEffect(()=>{document.documentElement.classList.toggle('dark',settings.theme==='dark');document.documentElement.style.fontSize=settings.fontSize+'px'},[settings.theme,settings.fontSize]);

  // ── Helpers ──
  const addExecLog=(tool:string,status:'running'|'done'|'error',detail='')=>{const id=Date.now()+Math.random().toString(36);setExecLog(p=>[...p.slice(-30),{id,time:new Date().toLocaleTimeString(),tool,status,detail}]);if(status!=='running'){setTimeout(()=>setExecLog(p=>p.filter(e=>e.id!==id||e.status==='running'||p.slice(-3).some(x=>x.id===id))),8000)}};
  const showToast=(msg:string,type='error')=>{const id=Date.now();setToasts(p=>[...p.slice(-3),{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000)};

  // ── Query ──
  const query=useCallback(async(t:string,rgn?:boolean)=>{
    if(!t||streaming)return;stop.current=false;
    const sid=activeSessionId||'default';setInp('');setFs([]);
    if(!rgn){d(addMessage({sessionId:sid,message:{id:'u'+Date.now(),role:'user',content:t,timestamp:Date.now()}}))}
    d(setStreaming(true));setThk('分析中...');
    if(/优化|求解|排产|调度|指派|实验|对比|build|model|solve|benchmark|Benders|分解/.test(t)&&t.length>15){try{const api=window.electronAPI;if(api){const p=await api.plannerGenerate(t);setPlan(p);setPlanId(p.id);addExecLog('planner','running','分析任务并生成计划...')}}catch{}}
    try{
      let ctx=t;
      if(web){try{const{webSearch}=await import('./utils/search');const r=await webSearch(t,settings.apiKeys.serper);if(r.length>0&&!r[0].title.includes('not configured'))ctx+='\n[Web]\n'+r.map((x:any)=>'- '+x.title+': '+x.snippet).join('\n')}catch(e:any){}}
      const api=window.electronAPI;if(!api)throw new Error('Electron API not ready');
      let res;try{res=await api.queryStream({text:ctx,strategy,apiKeys:settings.apiKeys})}catch(e:any){res=await api.query({text:ctx,strategy,apiKeys:settings.apiKeys})}
      if(stop.current)return;setThk(res?.routing?.selected_models?.join(', ')||'');
      let cnt=(res?.responses||[]).map((r:any)=>r?.content||'').join('\n\n')||'';
      if(!cnt||cnt.trim().length===0){showToast('服务器返回空回复','warn');cnt='*[空回复]*'}
      d(addMessage({sessionId:sid,message:{id:'a'+Date.now(),role:'assistant',content:cnt,timestamp:Date.now(),model:res?.routing?.selected_models?.join(', ')||'',routing:{intent:res?.routing?.top_intent,models:res?.routing?.selected_models||[],rationale:res?.routing?.rationale||''}}}));
      d(incrementUsage());
    }catch(e:any){showToast('连接失败: '+(e.message||'未知错误'),'error');d(addMessage({sessionId:sid,message:{id:'e'+Date.now(),role:'assistant',content:'Error: '+(e.message||'Connection failed'),timestamp:Date.now()}}))}
    d(setStreaming(false));setThk('');
  },[streaming,strategy,activeSessionId,d,fs,web,settings]);

  // ── Actions ──
  const send=()=>{const t=inp.trim();if(!t||streaming)return;query(t)};
  const cp=(c:string)=>{navigator.clipboard.writeText(c).catch(()=>{});setCid(c.slice(0,20));setTimeout(()=>setCid(''),1500)};
  const rg=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)query(u.content,true)};
  const br=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)d(branchSession({sourceSessionId:act.id,upToMessageId:u.id}))};
  const ex=()=>{if(!act||act.messages.length===0)return;const md2=act.messages.map(m=>'### '+(m.role==='user'?'User':'Assistant')+'\n\n'+m.content+'\n').join('\n---\n');const b=new Blob([md2],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(act.name||'session')+'.md';a.click()};

  // Resize handlers (extracted for babel parse safety)
  const resizeLeft=(e:any)=>{const sx=e.clientX;const ow=leftW;const mv=(ev:any)=>{const nw=Math.min(360,Math.max(160,ow+ev.clientX-sx));setLeftW(nw)};const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);document.body.style.cursor='';document.body.style.userSelect=''};document.body.style.cursor='ew-resize';document.body.style.userSelect='none';document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)};
  const resizeRight=(e:any)=>{const sx=e.clientX;const ow=rightW;const mv=(ev:any)=>{const nw=Math.min(400,Math.max(200,ow+sx-ev.clientX));setRightW(nw)};const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);document.body.style.cursor='';document.body.style.userSelect=''};document.body.style.cursor='ew-resize';document.body.style.userSelect='none';document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)};

  const confirmPlan=async()=>{if(!planId)return;const api=window.electronAPI;if(!api)return;setThk('执行中...');d(setStreaming(true));try{await api.plannerExecute(planId);setPlan(null);setPlanId('');setPlanProg(null);addExecLog('planner','done','计划执行完成');d(addMessage({sessionId:activeSessionId!,message:{id:'p'+Date.now(),role:'assistant',content:'计划已执行完成。',timestamp:Date.now(),model:'Planner'}}))}catch(e:any){addExecLog('planner','error',e.message);d(addMessage({sessionId:activeSessionId!,message:{id:'e'+Date.now(),role:'assistant',content:'执行失败: '+e.message,timestamp:Date.now()}}))}d(setStreaming(false));setThk('')};
  const rejectPlan=async()=>{const api=window.electronAPI;if(!api)return;await api.plannerReject(planId);setPlan(null);setPlanId('');setPlanProg(null);setExecLog(p=>p.filter(e=>e.tool!=='planner'))};

  const activeModel=sc.settings.apiKeys.anthropic?'Claude Sonnet':sc.settings.apiKeys.openai?'GPT-4o':'DeepSeek';
  const stratLabel=strategy==='best_quality'?'优质模式':strategy==='cost_optimized'?'极速模式':'协同验证';

  if(splash)return <Splash fade={splashFade}/>;

  // Precompute conditional panels to avoid Babel TSX parse issues
  var leftPanel = null;
  if (leftOpen) {
    leftPanel = <div key="left" style={{display:'flex',flexShrink:0}}>
      <LeftSidebar
        width={leftW}
        sessions={sessions} activeId={activeSessionId} pct={pct}
        onSelect={(id:any)=>d(setActiveSession(id))}
        onNew={()=>d(ns())}
        onDelete={(id)=>d(deleteSession(id))}
        onOpenSettings={()=>d(toggleSettings())}
      />
      <div onMouseDown={resizeLeft} style={{width:4,cursor:'ew-resize',flexShrink:0}}/>
    </div>;
  }

  var rightPanel = null;
  if (rightOpen) {
    rightPanel = <div key="right" style={{display:'flex',flexShrink:0}}>
      <div onMouseDown={resizeRight} style={{width:4,cursor:'ew-resize',flexShrink:0}}/>
      <RightSidebar
        width={rightW}
        execLog={execLog} todoSteps={todoSteps}
        plan={plan} planProg={planProg} planId={planId}
        onConfirmPlan={confirmPlan}
        onRejectPlan={rejectPlan}
        onStopPlan={()=>{stop.current=true;d(setStreaming(false));setThk('');rejectPlan()}}
      />
    </div>;
  }

  var toastEl = toasts.length>0 ? <ToastC toasts={toasts}/> : null;
  var settingsEl = settingsOpen ? <SettingsPanel/> : null;
  var cmdEl = cmd ? <CmdPalette onClose={()=>setCmd(false)}/> : null;

  // Precompute messages
  var msgList = null;
  if (!act || act.messages.length===0) {
    msgList = <ConversationEmpty
      icon={<span>✦</span>}
      title="描述你的优化问题"
      description="用自然语言描述优化问题——背包、排产、指派、调度——Polaris 自动建模并求解"
    >
      <SuggestionsList suggestions={SUGGESTIONS} onSelect={(s)=>{setInp(s);setTimeout(()=>{var el=document.querySelector('textarea');if(el)el.focus()},50)}} showIcons/>
    </ConversationEmpty>;
  } else {
    msgList = act.messages.map((m:any,i:number)=>{
      if (m.role==='user') return <Message key={m.id} from="user" index={i}>{m.content}</Message>;
      var dlBlocks=[];var matches=m.content.matchAll(/```(python|py|code)\n([\s\S]*?)```/g);for(var match of matches)dlBlocks.push({lang:match[1],code:match[2].trim()});
      var dlEl = dlBlocks.length>0 ? <div className="flex gap-1 mt-3">{dlBlocks.map(function(b:any,j:number){return <DownloadButton key={j}onClick={function(){var blob=new Blob([b.code],{type:'text/plain'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=b.lang==='py'?'polaris_model.py':'model.py';a.click()}}/>})}</div> : null;
      var actBtns = i===act.messages.length-1 ? <div style={{display:'flex',gap:2}}><RetryButton onClick={rg}/><BranchButton onClick={br}/></div> : null;
      return <Message key={m.id} from="assistant" index={i} metadata={m.model||''}>
        {m.routing&&<Reasoning title={m.routing.intent||'路由'}>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            <span style={{borderRadius:9999,background:'hsl(var(--primary)/.1)',color:'hsl(var(--primary))',padding:'1px 8px',fontSize:10,fontFamily:'monospace'}}>{m.routing.intent}</span>
            {m.routing.models?.map((md:any,j:number)=><span key={j} style={{borderRadius:9999,background:'hsl(var(--muted-foreground)/.1)',padding:'1px 8px',fontSize:10,fontFamily:'monospace'}}>{md}</span>)}
          </div>
        </Reasoning>}
        <div dangerouslySetInnerHTML={{__html:md(m.content)}} style={{fontSize:14,lineHeight:1.625}}/>
        {dlEl}
        <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <CopyButton onClick={()=>cp(m.content)} copied={cid===m.content.slice(0,20)}/>
          {actBtns}
        </div>
      </Message>;
    });
  }

  var thinkingEl = thk ? <Thinking label={thk}/> : null;

  return <div>
    {toastEl}
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Titlebar ── */}
      <div className="flex items-center justify-between h-11 px-4 bg-card border-b border-border shrink-0 select-none drag">
        <div className="flex items-center gap-3 no-drag">
          <div className="flex items-baseline gap-2"><span className="text-sm font-semibold font-mono tracking-tight">Polaris</span><Badge variant="secondary" className="text-[9px] font-mono px-1.5">SOLVER</Badge></div>
          {thk?<span className="text-[10px] text-muted-foreground font-mono animate-pulse">{thk}</span>:null}
        </div>
        <div className="flex items-center gap-1 no-drag">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={()=>setLeftOpen(!leftOpen)} title={leftOpen?'隐藏侧栏':'显示侧栏'}>◧</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={()=>setRightOpen(!rightOpen)} title={rightOpen?'隐藏工作流':'显示工作流'}>◨</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={()=>setCmd(true)} title="命令面板 (Ctrl+P)">⌘</Button>
          <WinBtns/>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {leftPanel}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          <Conversation>
            {interventions.map(function(c:any){return <div key={c.ts} className={'flex items-center gap-3 px-4 py-2 rounded-lg border text-xs animate-fade-in '+ (c.level===3?'border-l-2 border-destructive bg-destructive/5':'border-l-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20')}><span className="flex-1 text-muted-foreground">{c.body}</span><div className="flex gap-2"><Button size="sm"variant="outline"className="h-7 text-[10px]"onClick={()=>{var api=window.electronAPI;if(api&&c.eventKey)api.monitorFeedback({eventKey:c.eventKey,accepted:true});setInterventions(function(p:any){return p.filter(function(x:any){return x.ts!==c.ts})})}}>接受</Button><Button size="sm"variant="ghost"className="h-7 text-[10px]"onClick={()=>{var api=window.electronAPI;if(api&&c.eventKey)api.monitorFeedback({eventKey:c.eventKey,accepted:false});setInterventions(function(p:any){return p.filter(function(x:any){return x.ts!==c.ts})})}}>忽略</Button></div></div>})}
            <MessageList>{msgList}</MessageList>
            {thinkingEl}
          </Conversation>
          <div className="shrink-0">
            <AuthBanner/>
            <div className="px-4 pb-6 pt-2">
              <MessageInput
                value={inp} onChange={setInp} onSubmit={send}
                placeholder="描述优化问题... Enter 发送，Shift+Enter 换行"
                disabled={streaming} isStreaming={streaming}
                onStop={()=>{stop.current=true;d(setStreaming(false));setThk('')}}
                onCommand={()=>setCmd(true)}
                statusText={stratLabel+' · '+activeModel+' · '+(web?'联网搜索':'本地引擎')}
                toolbarRight={<WebSearchButton active={web}onClick={()=>setWeb(!web)}/>}
              />
            </div>
          </div>
        </div>
        {rightPanel}
      </div>
    </div>
    {settingsEl}
    {cmdEl}
    <LoginModal/>
  </div>;
};

/* ── Command Palette ── */
function CmdPalette({onClose}:any){
  const d=useAppDispatch();const[q,setQ]=useState('');
  const cmds=[
    {id:'quality',l:'优质模式',a:()=>{d(setStrategy('best_quality'));onClose()}},
    {id:'cost',l:'极速模式',a:()=>{d(setStrategy('cost_optimized'));onClose()}},
    {id:'ensemble',l:'协同验证',a:()=>{d(setStrategy('ensemble'));onClose()}},
    {id:'new',l:'新建会话',a:()=>{d(ns());onClose()}},
    {id:'settings',l:'打开设置',a:()=>{d(toggleSettings());onClose()}},
  ].filter(x=>!q||x.l.toLowerCase().includes(q.toLowerCase()));

  return(
    <div className="fixed inset-0 z-[300] bg-background/60 backdrop-blur-sm flex items-start justify-center pt-36 animate-fade-in"onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[480px] max-w-[92vw] overflow-hidden shadow-2xl"onClick={e=>e.stopPropagation()}>
        <input className="w-full px-5 py-3.5 bg-transparent border-b border-border text-sm outline-none placeholder:text-muted-foreground"autoFocus value={q}onChange={e=>setQ(e.target.value)}placeholder="搜索命令..."/>
        <div className="max-h-[280px] overflow-auto p-1.5">
          {cmds.map(c=><div key={c.id}className="px-4 py-2.5 cursor-pointer text-sm text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg flex justify-between transition-colors"onClick={c.a}><span>{c.l}</span></div>)}
        </div>
      </div>
    </div>
  );
}

export default App;
