// @ts-nocheck
import React,{useState,useCallback,useRef,useEffect,useMemo}from'react';
import{useAppSelector,useAppDispatch}from'./store';
import{addMessage,updateLastAssistant,editMessage,loadSessions as lr,newSession as ns,setActiveSession,setStreaming,setStrategy,toggleSettings,setTheme,setLanguage,setFontSize,setApiKey,updateAgentConfig,setMascotSettings,updateThirdParty,updateProxy,deleteSession,branchSession,setEngineStatus}from'./store/chatSlice';
import{restoreAuth,incrementUsage,openLoginModal,logoutUser}from'./store/authSlice';
import{saveSessions,loadSettings as loadSet,saveSettings as saveSet,loadSessions as ld}from'./store/persist';
import SettingsPanel from'./components/SettingsPanel';
import{LoginModal}from'./components/LoginModal';
import{Onboarding,ONBOARDING_KEY}from'./components/Onboarding';
import{AuthBanner}from'./components/AuthBanner';
import{Mascot}from'./components/Mascot';
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
  Thinking,Reasoning
}from'./components/ai';

if(typeof window!=='undefined')(window).copyCode=function(btn){var pre=btn.closest('.code-block')?.querySelector('pre code');var text=pre?.textContent||'';navigator.clipboard.writeText(text).then(function(){btn.textContent='已复制';setTimeout(function(){btn.textContent='复制'},1500)}).catch(function(){})};

/* ── Splash (auto-sandbox) ── */
const Splash=({fade,setupProgress,setupError}:{fade:boolean;setupProgress:any;setupError:string})=>{
  const pct = setupProgress?.percent || 0;
  const msg = setupProgress?.message || (setupError ? setupError : '正在检查运行环境...');
  const phase = setupProgress?.phase || '';
  const isDone = phase === 'done' || setupError;
  return(
  <div className={'fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8 bg-background transition-opacity duration-500 '+ (fade?'opacity-0 pointer-events-none':'')}>
    <div className="font-mono text-xl font-semibold tracking-widest text-primary animate-fade-in-bright">POLARIS SOLVER</div>
    <div className="relative w-[120px] h-[120px]">
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-converge"/>
      <div className="absolute top-[15px] left-[15px] w-[90px] h-[90px] rounded-full border-2 border-transparent border-r-muted-foreground animate-converge"style={{animationDelay:'0.4s',animationDuration:'2.5s'}}/>
      <div className="absolute top-[30px] left-[30px] w-[60px] h-[60px] rounded-full border-2 border-transparent border-b-emerald-500 animate-converge"style={{animationDelay:'0.8s',animationDuration:'2s'}}/>
      <div className="absolute top-[57px] left-[57px] w-[6px] h-[6px] rounded-full bg-primary animate-pulse-dot"/>
    </div>
    {/* Progress bar */}
    {!isDone && <div className="w-[200px] space-y-2">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500"style={{width:Math.max(pct,2)+'%'}}/>
      </div>
      <p className="text-[10px] text-muted-foreground font-mono text-center">{msg}</p>
    </div>}
    {setupError && <p className="text-xs text-destructive text-center max-w-[280px]">{setupError}<br/><span className="text-muted-foreground">可跳过，在设置中手动安装</span></p>}
    <div className="text-[10px] text-muted-foreground font-mono tracking-widest">BITWOOL STUDIO</div>
  </div>);
};

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
function md(t:string):string{
// Pass through pre-formatted HTML (locked messages, inline buttons etc.)
if(t.substr(0,4)==='<div'||t.substr(0,5)==='<span'||t.substr(0,3)==='<p>')return t;
var BL="%%BLOCK%%";var BE="%%BEND%%";
var blocks=[];var out="";var inB=false;var lang="";var bc="";
for(var i=0;i<t.length;i++){
 if(t.substr(i,3)==="```"){
  if(inB){blocks.push({l:lang,c:bc.trim()});out+=BL+(blocks.length-1)+BE;bc="";lang="";inB=false;i+=2;}
  else{inB=true;i+=2;while(i+1<t.length&&t[i+1]!=="\n"[0]&&t[i+1]!=="\r"[0]){lang+=t[i+1];i++;}if(t[i+1]==="\r"[0])i++;i++;}
  continue;}
 if(inB){bc+=t[i];}else{out+=t[i];}
}
// Step 1: Protect known HTML tags (inline buttons, locked messages)
var htmlTags=[];
out=out.replace(/(<\/?(?:div|button|b|p|span|strong|em|h[1-6]|li|ul|ol|br|hr|table|thead|tbody|tr|th|td|pre|code|a|img|input|label|form|select|option|textarea|svg|path|circle|line|polygon|polyline|rect|g|defs|use|clipPath|mask|filter)(?:\s[^>]*)?\/?>)/gi,function(m){htmlTags.push(m);return"<!--HTAG"+(htmlTags.length-1)+"-->";});
// Step 2: Escape remaining text
out=out.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
// Step 3: Restore protected HTML tags
out=out.replace(/<!--HTAG(\d+)-->/g,function(_,idx){return htmlTags[parseInt(idx)];});
out=out.replace(new RegExp(BL+"(\\d+)"+BE,"g"),function(_,idx){
 var b=blocks[parseInt(idx)];
 var ec=b.c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 return "<div class=\"code-block my-3 rounded-lg border border-border overflow-hidden\"><div class=\"flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border\"><span class=\"text-[10px] font-mono text-muted-foreground\">"+(b.l||"plaintext")+"</span><button onclick=\"copyCode(this)\" class=\"text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors\">复制</button></div><pre class=\"p-4 overflow-x-auto text-xs font-mono leading-relaxed\"><code>"+hl(ec,b.l)+"</code></pre></div>";
	// -- Markdown Tables -> HTML --
	var tableRe=new RegExp('(\\|.+\\|\\n)+(\\|[-:\\s]+\\|\\n)+(\\|.+\\|\\n?)+','g');
	out=out.replace(tableRe,function(tb){
	 var rows=tb.trim().split(/\n/);if(rows.length<3)return tb;
	 var thead='<thead><tr>'+rows[0].replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(c){return'<th class="px-3 py-2 text-left text-xs font-semibold border-b border-border">'+c.trim()+'</th>'}).join('')+'</tr></thead>';
	 var tbody='<tbody>';
	 for(var ri=2;ri<rows.length;ri++){tbody+='<tr>'+rows[ri].replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(c){return'<td class="px-3 py-2 text-xs border-b border-border/50">'+c.trim()+'</td>'}).join('')+'</tr>';}
	 tbody+='</tbody>';
	 return'<div class="my-3 overflow-x-auto rounded-lg border border-border"><table class="w-full">'+thead+tbody+'</table></div>';
	});
});
out=out.replace(/`([^`]+)`/g,'<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">$1</code>');
out=out.replace(/\*\*(.+?)\*\*/g,'<strong class="font-semibold">$1</strong>');
out=out.replace(/\*(.+?)\*/g,'<em class="text-muted-foreground">$1</em>');
out=out.replace(/^### (.+)/gm,'<h3 class="text-sm font-semibold mt-4 mb-2">$1</h3>');
out=out.replace(/^## (.+)/gm,'<h2 class="text-base font-semibold mt-5 mb-3">$1</h2>');
out=out.replace(/^# (.+)/gm,'<h1 class="text-lg font-bold mt-5 mb-3 pb-2 border-b border-border">$1</h1>');
out=out.replace(/^[-*] (.+)/gm,'<li class="ml-4 text-sm">$1</li>');
var br2=new RegExp('\\n\\n','g');out=out.replace(br2,'<br/><br/>');
var br1=new RegExp('\\n','g');out=out.replace(br1,'<br/>');
return'<p>'+out+'</p>';}

function hl(c:string,l:string):string{
var kw={js:'const let var function return if else for while class export import async await'.split(' '),py:'def return if elif else for while class import from async await try except'.split(' ')};
var words=kw[l]||[];var o=c;
words.forEach(function(x){o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span style="color:hsl(var(--primary))">'+x+'</span>')});
return o;}

/* ─────────────────────────────────────────────────
   WORKFLOW VIEW — elegant pipeline timeline
   ───────────────────────────────────────────────── */
function WorkflowView({plan,planProg,planId,execLog,todoSteps,onConfirmPlan,onRejectPlan,onStopPlan}:any){
  var hasPlan=!!plan;
  var isExecuting=!!planProg;
  var hasContent=hasPlan||(execLog&&execLog.length>0)||(todoSteps&&todoSteps.length>0);

  return(
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary"/>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">工作流</span>
        {isExecuting&&<span className="text-[9px] text-primary font-mono animate-pulse ml-auto">运行中</span>}
        {!isExecuting&&hasContent&&<span className="text-[9px] text-muted-foreground font-mono ml-auto">就绪</span>}
      </div>
      <Separator/>

      <ScrollArea className="flex-1">
        <div className="px-3 py-3">
          {/* ── Timeline: plan steps ── */}
          {hasPlan&&plan.steps&&(
            <div className="space-y-0">
              {plan.steps.map(function(s:any,i:number){
                var isLast=i===plan.steps.length-1;
                var status='pending';var dotColor='bg-muted-foreground/25';
                if(planProg){
                  if(planProg.type==='step_done'&&planProg.step===s.id){status='done';dotColor='bg-emerald-500';}
                  else if(planProg.step===s.id&&planProg.type==='step_start'){status='running';dotColor='bg-primary';}
                  else if(planProg.type==='step_error'&&planProg.step===s.id){status='error';dotColor='bg-destructive';}
                }
                return <div key={s.id} className="relative pl-6 pb-4 last:pb-0">
                  {!isLast&&<div className="absolute left-[7px] top-3 w-0.5 h-[calc(100%-4px)] bg-border/50"/>}
                  <div className={'absolute left-[3px] top-1 w-2.5 h-2.5 rounded-full border-2 '+ (status==='running'?'border-primary bg-primary':'border-border '+dotColor)} style={{boxShadow:status==='running'?'0 0 8px hsla(var(--primary)/.4)':''}}/>
                  <div className={'rounded-lg px-3 py-2 transition-all '+ (status==='running'?'bg-primary/5 border border-primary/15':status==='done'?'opacity-50':'')}>
                    <div className="text-[11px] font-medium text-foreground leading-snug">{s.description}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-muted-foreground font-mono">{s.agent||'agent'}</span>
                      {status==='running'&&<span className="flex gap-0.5"><span className="h-1 w-1 rounded-full bg-primary animate-pulse-dot"/><span className="h-1 w-1 rounded-full bg-primary animate-pulse-dot"style={{animationDelay:'0.2s'}}/></span>}
                    </div>
                  </div>
                </div>;
              })}
            </div>
          )}

          {/* ── Exec log: compact chips ── */}
          {execLog&&execLog.length>0&&(
            <div className="mt-3">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mb-2 px-1">工具调用</div>
              <div className="space-y-1">
                {execLog.slice(-15).reverse().map(function(e:any){
                  var color={running:'border-primary/30 bg-primary/5',done:'border-emerald-500/20 bg-emerald-500/5',error:'border-destructive/20 bg-destructive/5'}[e.status]||'border-border/30 bg-muted/20';
                  return <div key={e.id} className={'flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[10px] transition-all '+color}>
                    <span className="font-mono font-medium text-foreground shrink-0">{e.tool}</span>
                    <span className="flex-1 text-muted-foreground truncate">{e.detail||''}</span>
                    <span className="text-[8px] text-muted-foreground/40 font-mono shrink-0">{e.time}</span>
                  </div>;
                })}
              </div>
            </div>
          )}

          {/* ── Todo steps: mini list ── */}
          {todoSteps&&todoSteps.length>0&&(
            <div className="mt-3">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mb-2 px-1">任务</div>
              <div className="space-y-0.5">
                {todoSteps.map(function(t:any){
                  var icon={running:'●',done:'✓',pending:'○'}[t.status]||'○';
                  var clr={running:'text-primary',done:'text-emerald-500',pending:'text-muted-foreground/30'}[t.status]||'text-muted-foreground';
                  return <div key={t.id} className="flex items-center gap-2 px-2.5 py-1 text-[10px]">
                    <span className={'font-mono text-[9px] '+clr}>{icon}</span>
                    <span className={t.status==='running'?'font-medium text-foreground':'text-muted-foreground'}>{t.label}</span>
                  </div>;
                })}
              </div>
            </div>
          )}

          {/* ── Idle state ── */}
          {!hasContent&&(
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/30">
                  <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
                </svg>
              </div>
              <p className="text-[10px] text-muted-foreground/40 font-mono">等待任务</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Stop button ── */}
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
  const d = useAppDispatch();
  const[proOpen,setProOpen]=useState(false);
  const proRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{function click(e:MouseEvent){if(proRef.current&&!proRef.current.contains(e.target as Node))setProOpen(false)};document.addEventListener('mousedown',click);return()=>document.removeEventListener('mousedown',click)},[]);
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
      {/* Settings + Lab + Login buttons */}
      <div className="px-2 py-1.5 space-y-1 border-t border-border">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2"/></svg>
          <span>设置</span>
        </button>
        <button onClick={() => { onOpenSettings(); setTimeout(() => { var el = document.querySelector('[data-tab="lab"]'); if (el) (el as HTMLElement).click(); }, 100); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2v6l-3 4h12l-3-4V2"/><line x1="8" y1="11" x2="8" y2="14"/><line x1="3" y1="12" x2="13" y2="12"/></svg>
          <span>实验 Lab</span>
        </button>
        {auth.user ? (
          <div className="relative" ref={proRef}>
            <button onClick={()=>setProOpen(!proOpen)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{background:auth.user.avatar}}>{auth.user.displayName.slice(0,1).toUpperCase()}</div>
              <span className="truncate">{auth.user.displayName}</span>
              <span className="ml-auto text-[9px] text-muted-foreground/50">▾</span>
            </button>
            {proOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-52 rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in z-[200]">
                <div className="px-3.5 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:auth.user.avatar}}>{auth.user.displayName.slice(0,1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{auth.user.displayName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{auth.user.email}</div>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <span className="text-[9px] text-muted-foreground/50 font-mono">ID: {auth.user.id?.slice(0,10)}…</span>
                  </div>
                </div>
                <div className="px-2 py-1">
                  <button onClick={()=>{d(openLoginModal());setProOpen(false)}} className="w-full px-3 py-2 rounded-lg text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s2-4 6-4 6 4 6 4"/></svg>
                    切换账号
                  </button>
                  <button onClick={()=>{d(logoutUser());setProOpen(false)}} className="w-full px-3 py-2 rounded-lg text-left text-xs text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H7"/></svg>
                    退出登录
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => d(openLoginModal())} className="polaris-login-trigger w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
            <span>登录 BitWool</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Right Sidebar ---
function RightSidebar({execLog,todoSteps,plan,planProg,planId,onConfirmPlan,onRejectPlan,onStopPlan,width}:any){
  return(
    <div style={{width:width}} className="shrink-0 bg-card border-l border-border flex flex-col h-full overflow-hidden">
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
  const[showOnboarding,setShowOnboarding]=useState(false);
  const mascotCfg = useAppSelector(s => s.chat.settings.mascot);
  const splashRef=useRef(true);
  const[sandboxProg,setSandboxProg]=useState<any>(null);const[sandboxErr,setSandboxErr]=useState('');
  const[thinking,setThinking]=useState('');const mascotAreaRef=useRef<HTMLDivElement>(null);
  const[toasts,setToasts]=useState<any[]>([]);
  const[execLog,setExecLog]=useState<{id:string;time:string;tool:string;status:'running'|'done'|'error';detail:string}[]>([]);
  const[todoSteps,setTodoSteps]=useState<{id:string;status:'pending'|'running'|'done';label:string}[]>([]);
  const[interventions,setInterventions]=useState<any[]>([]);
  const[plan,setPlan]=useState<any>(null);const[planProg,setPlanProg]=useState<any>(null);const[planId,setPlanId]=useState('');

  // Panel widths (px) & visibility
  const[leftW,setLeftW]=useState(220);const[leftOpen,setLeftOpen]=useState(true);
  const[rightW,setRightW]=useState(280);const[rightOpen,setRightOpen]=useState(true);

  const dispatchRef=useRef(d);useEffect(()=>{dispatchRef.current=d},[d]);
  const stop=useRef(false);
  const act=useMemo(()=>sessions.find(s=>s.id===activeSessionId),[sessions,activeSessionId]);
  const pct=contextTokens.total>0?Math.min(Math.round(contextTokens.used/Math.max(contextTokens.total,1)*100),100):0;

  // ── Init (auto sandbox) ──
  useEffect(()=>{const api=window.electronAPI;if(!api)return;
    // Fail-safe: dismiss splash after 3 min even if setup hangs
    var failSafe=setTimeout(function(){if(splashRef.current){setSandboxProg({phase:'error',message:'安装超时，请检查网络',percent:0});setSplashFade(true);setTimeout(function(){setSplash(false)},500)}},180000);
    // Listen for sandbox progress
    api.onSandboxProgress((d:any)=>{clearTimeout(failSafe);setSandboxProg(d);if(d.phase==='done'||d.phase==='error'){
      api.healthCheck().then((r:any)=>{if(Array.isArray(r)){var ss={python:false,polaris:false,highs:false,deepseek:false};r.forEach((x:any)=>{if(x.service==='Python')ss.python=x.ok;if(x.service==='Polaris Engine')ss.polaris=x.ok;if(x.service==='HiGHS Solver')ss.highs=x.ok;if(x.service==='DeepSeek API')ss.deepseek=x.ok;});d(setEngineStatus(ss));}}).catch(function(){});
      setTimeout(function(){setSplashFade(true);setTimeout(function(){setSplash(false)},500);}, d.phase==='error'?0:400);
    }});
    // Auto-start sandbox setup
    api.sandboxAutoSetup().then(function(r:any){
      if(r.alreadyReady){clearTimeout(failSafe);setSplashFade(true);setTimeout(function(){setSplash(false)},500);}
    }).catch(function(e:any){clearTimeout(failSafe);setSandboxErr(e.message||'沙箱自动安装失败');setTimeout(function(){setSplashFade(true);setTimeout(function(){setSplash(false)},500);},1200);});
    return function(){clearTimeout(failSafe);};
  },[]);
  // ── Auto-restore auth + sessions + settings ──
  useEffect(()=>{
    document.documentElement.classList.toggle('dark',settings.theme==='dark');
    document.documentElement.style.fontSize=settings.fontSize+'px';
    d(restoreAuth());
    var s=ld();if(s.length>0)d(lr(s));
    // Load persisted settings LAST (overwrites defaults)
    var saved=loadSet();
    if(saved&&Object.keys(saved).length>0){
      // Wrap in setTimeout to let Redux init complete
      setTimeout(function(){
        if(saved.theme)d(setTheme(saved.theme));
        if(saved.language)d(setLanguage(saved.language));
        if(saved.fontSize)d(setFontSize(saved.fontSize));
        if(saved.apiKeys){Object.keys(saved.apiKeys).forEach(function(k){var v=saved.apiKeys[k];if(v)d(setApiKey({provider:k,key:v}));});}
        if(saved.agent)d(updateAgentConfig(saved.agent));
        if(saved.mascot)d(setMascotSettings(saved.mascot||{}));
        if(saved.thirdParty)d(updateThirdParty(saved.thirdParty));
        if(saved.proxy)d(updateProxy(saved.proxy));
        // Apply theme after restore
        document.documentElement.classList.toggle('dark',saved.theme==='dark');
      },0);
    }
  },[]);
  useEffect(()=>{if(sessions.length>0){var t=setTimeout(function(){saveSessions(sessions)},500);return function(){clearTimeout(t)}}},[sessions]);
  // Persist settings on change
  useEffect(()=>{var t=setTimeout(function(){saveSet(settings)},300);return function(){clearTimeout(t)}},[settings]);
  // ── Global click: handle AI-generated inline buttons ──
  useEffect(()=>{
    var handler=function(e:MouseEvent){
      var target=e.target as HTMLElement;
      if(!target||!target.classList.contains('polaris-inline-btn'))return;
      e.preventDefault();e.stopPropagation();
      var ta=document.querySelector('textarea');
      var prompt=target.getAttribute('data-prompt')||target.textContent||'';
      if(prompt&&ta){
        var nativeInputValueSetter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set;
        if(nativeInputValueSetter){nativeInputValueSetter.call(ta,prompt);ta.dispatchEvent(new Event('input',{bubbles:true}));}
        else{ta.value=prompt;ta.dispatchEvent(new Event('input',{bubbles:true}));}
        ta.focus();setInp(prompt);
      }
      if(target.classList.contains('polaris-login'))d(openLoginModal());
    };
    document.addEventListener('click',handler);
    return ()=>document.removeEventListener('click',handler);
  },[d]);

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
    d(setStreaming(true));setThinking('');
    var msgId='a'+Date.now();var modelName='';var hasAdded=false;
    if(/优化|求解|排产|调度|指派|实验|对比|build|model|solve|benchmark|Benders|分解/.test(t)&&t.length>15){try{var pApi=window.electronAPI;if(pApi){var pp=await pApi.plannerGenerate(t);setPlan(pp);setPlanId(pp.id);addExecLog('planner','running','分析任务并生成计划...');
  var pid=pp.id;
  setTimeout(async function(){
    try{addExecLog('planner','running','自动执行研究计划...');
    await pApi.plannerExecute(pid);setPlan(null);setPlanId('');setPlanProg(null);
    addExecLog('planner','done','计划执行完成');
    }catch(e2){addExecLog('planner','error',e2.message);}
  },200);
}}catch{}}
    try{
      var ctx=t;
      if(web){try{var{webSearch}=await import('./utils/search');var sr=await webSearch(t,settings.apiKeys.serper);if(sr.length>0&&!sr[0].title.includes('not configured'))ctx+='\n[Web]\n'+sr.map(function(x){return'- '+x.title+': '+x.snippet}).join('\n')}catch(e){}}
      var streamApi=window.electronAPI;if(!streamApi)throw new Error('Electron API not ready');
      var fullContent='';var routingInfo=null;
      // True streaming: add message on first content, then update incrementally
      streamApi.onStreamChunk(function(chunk){
        if(stop.current)return;
        if(chunk.type==='thinking'){setThinking(chunk.text||'');}
        else if(chunk.type==='content'){
          fullContent=chunk.full||fullContent;setThk('');
          if(!hasAdded){hasAdded=true;d(addMessage({sessionId:sid,message:{id:msgId,role:'assistant',content:fullContent,timestamp:Date.now()}}));}
          else{d(updateLastAssistant({sessionId:sid,content:fullContent}));}
        }
        else if(chunk.type==='tool_call'){setThinking('调用工具...');}
      });
      streamApi.onStreamEnd(function(res){
        if(stop.current)return;
        routingInfo=res?.routing;modelName=res?.routing?.selected_models?.join(', ')||'';
        if(hasAdded){d(updateLastAssistant({sessionId:sid,content:fullContent,model:modelName,routing:{intent:res?.routing?.top_intent,models:res?.routing?.selected_models||[],rationale:res?.routing?.rationale||''}}));}
        else{
          if(!fullContent||fullContent.trim().length===0){if(res?.responses){fullContent=(res.responses||[]).map(function(r){return r?.content||''}).join('\n\n')||'';}}
          if(!fullContent||fullContent.trim().length===0){showToast('服务器返回空回复','warn');fullContent='*[空回复]*';}
          d(addMessage({sessionId:sid,message:{id:msgId,role:'assistant',content:fullContent,timestamp:Date.now(),model:modelName||'',routing:{intent:res?.routing?.top_intent,models:res?.routing?.selected_models||[],rationale:res?.routing?.rationale||''}}}));
        }
        d(incrementUsage());d(setStreaming(false));setThinking('');setThk('');
        streamApi.removeStreamListeners();
      });
      // Safety: 30s timeout
      var safetyTimer=setTimeout(function(){
        if(!hasAdded){fullContent=fullContent||'*响应超时*';d(addMessage({sessionId:sid,message:{id:msgId,role:'assistant',content:fullContent,timestamp:Date.now()}}));}
        d(incrementUsage());d(setStreaming(false));setThinking('');setThk('');
        streamApi.removeStreamListeners();
      },30000);
      await streamApi.queryStream({text:ctx,strategy,apiKeys:settings.apiKeys});
      clearTimeout(safetyTimer);
    }catch(e){showToast('连接失败: '+(e.message||'未知错误'),'error');d(setStreaming(false));setThinking('');setThk('');}

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

  // ── Onboarding (once) ──
  useEffect(()=>{if(!localStorage.getItem(ONBOARDING_KEY)&&!showOnboarding)setShowOnboarding(true)},[]);

  if(splash)return <Splash fade={splashFade} setupProgress={sandboxProg} setupError={sandboxErr}/>;
  if(showOnboarding)return <Onboarding onDone={()=>setShowOnboarding(false)}/>;

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
    />;
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

  var thinkingEl = (thk||thinking) ? <Thinking label={thinking||thk||'思考中...'}/> : null;

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
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative" ref={mascotAreaRef}>
          <Mascot thinking={streaming||!!thinking} containerRef={mascotAreaRef} enabled={mascotCfg.enabled} clickReactions={mascotCfg.clickReactions} autoWander={mascotCfg.autoWander} showWhenSleepy={mascotCfg.showWhenSleepy}/>
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
                toolbarRight={<WebSearchButton active={web}onClick={()=>setWeb(!web)}/>}
                footer={<StrategySelector/>}
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

/* ── Strategy Selector ── */
function StrategySelector(){
  var d=useAppDispatch();var st=useAppSelector(function(s){return s.chat.strategy});
  var modes=[
    {id:'cost_optimized',label:'快速',icon:'⚡',hint:'轻量回复 · 低 token'},
    {id:'best_quality',label:'优质',icon:'✦',hint:'标准回复 · 中 token'},
    {id:'ensemble',label:'专家',icon:'◈',hint:'深度推理 · 高 token'},
  ];
  return React.createElement('div',{className:'flex items-center gap-1.5'},
    React.createElement('span',{className:'text-[9px] text-muted-foreground/40 font-mono shrink-0'},'模式'),
    modes.map(function(m,i){
      var isActive=st===m.id;
      return React.createElement('button',{
        key:m.id,
        onClick:function(){d(setStrategy(m.id));},
        style:{border:'1px solid '+(isActive?'hsl(var(--primary)/.3)':'transparent'),background:isActive?'hsl(var(--primary)/.06)':'',borderRadius:'5px',padding:'2px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',transition:'all .15s',outline:'none'},
        className:isActive?'':'hover:bg-muted/50',
        title:m.hint,
      },
        React.createElement('span',{className:'text-[10px] opacity-50'},m.icon),
        React.createElement('span',{className:'text-[10px] font-medium',style:{color:isActive?'hsl(var(--primary))':'hsl(var(--muted-foreground))'}},m.label),
        isActive?React.createElement('span',{className:'text-[8px] font-mono',style:{color:'hsl(var(--primary)/.5)'}},m.hint.split('·')[1]?.trim()||''):null
      );
    })
  );
}

/* ── Command Palette ── */
function CmdPalette({onClose}:any){
  const d=useAppDispatch();const[q,setQ]=useState('');
  const cmds=[
    {id:'quality',l:'优质模式',a:()=>{d(setStrategy('best_quality'));onClose()}},
    {id:'cost',l:'快速模式',a:()=>{d(setStrategy('cost_optimized'));onClose()}},
    {id:'ensemble',l:'专家模式',a:()=>{d(setStrategy('ensemble'));onClose()}},
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
