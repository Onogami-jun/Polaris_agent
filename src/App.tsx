// @ts-nocheck
import React,{useState,useCallback,useRef,useEffect,useMemo}from'react';
import{useAppSelector,useAppDispatch}from'./store';
import{addMessage,updateLastAssistant,editMessage,loadSessions as lr,newSession as ns,setActiveSession,setStreaming,setStrategy,toggleSettings,setTheme,setLanguage,setFontSize,setApiKey,updateAgentConfig,setMascotSettings,updateThirdParty,updateProxy,deleteSession,branchSession,setEngineStatus}from'./store/chatSlice';
import{restoreAuth,incrementUsage,openLoginModal,logoutUser}from'./store/authSlice';
import{saveSessions,loadSettings as loadSet,saveSettings as saveSet,loadSessions as ld}from'./store/persist';
import SettingsPanel from'./components/SettingsPanel';
import{LoginModal}from'./components/LoginModal';
import{Onboarding,ONBOARDING_KEY}from'./components/Onboarding';
import{StandaloneLab}from'./components/AgentLab';
import{t}from'./i18n';
import{AuthBanner}from'./components/AuthBanner';
import{Mascot}from'./components/Mascot';
import{Button}from'./components/ui/button';
import{Separator}from'./components/ui/separator';
import{ScrollArea}from'./components/ui/scroll-area';
import{Conversation,MessageList,MessageInput,WebSearchButton}from'./components/ai';

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
    <button onClick={()=>window.electronAPI?.minimize()} className="win-btn min"/>
    <button onClick={()=>window.electronAPI?.maximize()} className="win-btn max"/>
    <button onClick={()=>window.electronAPI?.close()} className="win-btn close"/>
  </div>);

/* ── Toast ── */
const ToastC:React.FC<{toasts:any[]}>=({toasts})=>(
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
    {toasts.map(t=><div key={t.id} className={'animate-fade-in px-4 py-2.5 rounded-lg text-sm text-white max-w-[380px] shadow-lg '+ (t.type==='error'?'bg-destructive':t.type==='warn'?'bg-amber-500':'bg-primary')}>{t.msg}</div>)}
  </div>);

/* ── Markdown (with memoization, re-parses only on content change) ── */
var _mdCache = new Map(); var _mdCacheSize = 0; var _mdCacheLimit = 200;
function md(t:string):string{
if(_mdCache.has(t))return _mdCache.get(t);
// Pass through pre-formatted HTML (locked messages, inline buttons etc.)
if(t.slice(0,4)==='<div'||t.slice(0,5)==='<span'||t.slice(0,3)==='<p>')return t;
var BL="%%BLOCK%%";var BE="%%BEND%%";
var blocks=[];var out="";var inB=false;var lang="";var bc="";
for(var i=0;i<t.length;i++){
 if(t.slice(i,i+3)==="```"){
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
var result='<p>'+out+'</p>';
if(_mdCacheSize<_mdCacheLimit){_mdCache.set(t,result);_mdCacheSize++;}
return result;}

function hl(c:string,l:string):string{
var kw={js:'const let var function return if else for while class export import async await'.split(' '),py:'def return if elif else for while class import from async await try except'.split(' ')};
var words=kw[l]||[];var o=c;
words.forEach(function(x){o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span style="color:hsl(var(--primary))">'+x+'</span>')});
return o;}

/* ─────────────────────────────────────────────────
   WORKFLOW VIEW — elegant pipeline timeline
   ───────────────────────────────────────────────── */
function WorkflowView({plan,planProg,planId,execLog,todoSteps,onStopPlan}:any){
  var isExecuting=!!planProg;
  var hasContent=!!plan||(execLog&&execLog.length>0)||(todoSteps&&todoSteps.length>0);

  function stepStatus(sId){
    if(!planProg)return'pending';
    if(planProg.type==='step_done'&&planProg.step===sId)return'done';
    if(planProg.step===sId&&planProg.type==='step_start')return'active';
    if(planProg.type==='step_error'&&planProg.step===sId)return'fail';
    return'pending';
  }

  return(
    <div className="wf-panel">
      <div className="wf-header">
        <div className="wf-header-dot"/>
        <span className="wf-header-label">Workflow</span>
        <span className={'wf-header-status '+(isExecuting?'running':'idle')}>{isExecuting?'running':'idle'}</span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{padding:'10px 0'}}>
        {/* ── Plan steps as semantic timeline ── */}
        {plan&&plan.steps&&plan.steps.map(function(s:any,i:number){
          var st=stepStatus(s.id);var isLast=i===plan.steps.length-1;
          return <div key={s.id} className="wf-step">
            {!isLast&&<div className={'wf-step-line '+(st==='done'?'done':st==='active'?'active':st==='fail'?'fail':'')}/>}
            <div className={'wf-step-dot '+st}/>
            <div className={'wf-step-card '+st}>
              <div className="wf-step-title">{s.description}</div>
              <div className="wf-step-agent">
                <span>{s.agent||'agent'}</span>
                {st==='active'&&<span className="think-dots" style={{marginLeft:6}}><span/><span/><span/></span>}
              </div>
            </div>
          </div>;
        })}
        {/* ── Tool execution chips ── */}
        {execLog&&execLog.length>0&&<div style={{padding:'8px 14px'}}>
          <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--p-text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>Tools</div>
          {execLog.slice(-10).reverse().map(function(e:any){
            return <div key={e.id} className={'wf-tool-chip '+e.status}>
              <span className="wf-tool-name">{e.tool}</span>
              <span className="wf-tool-detail">{e.detail||''}</span>
              <span className="wf-tool-time">{e.time}</span>
            </div>;
          })}
        </div>}
        {/* ── Idle state ── */}
        {!hasContent&&<div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',gap:12,textAlign:'center'}}>
          <div style={{width:40,height:40,borderRadius:12,background:'var(--p-surface-hover)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'var(--p-text-muted)'}}>P</div>
          <p style={{fontSize:11,color:'var(--p-text-muted)',fontFamily:'var(--font-mono)'}}>Waiting for task</p>
        </div>}
      </div>
      {isExecuting&&<div style={{padding:'10px 14px',borderTop:'1px solid var(--p-border)'}}>
        <button onClick={onStopPlan} style={{width:'100%',padding:'6px',borderRadius:6,border:'1px solid var(--p-border)',background:'var(--p-surface)',color:'var(--p-text-dim)',fontSize:11,cursor:'pointer',fontFamily:'var(--font-mono)'}}>Stop</button>
      </div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   LEFT SIDEBAR — Git panel + Sessions
   ───────────────────────────────────────────────── */
function LeftSidebar({sessions,activeId,onSelect,onNew,onDelete,onOpenSettings,onOpenLab,onOpenGit,width}:any){
  const auth = useAppSelector(s=>s.auth);
  const lang = useAppSelector(s=>s.chat.settings.language);
  const ghToken = useAppSelector(s=>s.chat.settings.apiKeys.github);
  const d = useAppDispatch();
  const[proOpen,setProOpen]=useState(false);
  const proRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{function click(e:MouseEvent){if(proRef.current&&!proRef.current.contains(e.target as Node))setProOpen(false)};document.addEventListener('mousedown',click);return()=>document.removeEventListener('mousedown',click)},[]);
  return(
    <div style={{width:width}} className="shrink-0 bg-card border-r border-border flex flex-col h-full overflow-hidden">
      {/* ── Git bar ── */}
      <button onClick={onOpenGit} className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 2v2.5M8 4.5a2 2 0 100 4 2 2 0 000-4zM4 11v2.5M12 11v2.5M8 8.5v4"/><circle cx="4" cy="13.5" r="1.3"/><circle cx="12" cy="13.5" r="1.3"/><path d="M4 11c0-1.5 1-2.5 1.5-2.5M12 11c0-1.5-1-2.5-1.5-2.5"/></svg>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">Git</span>
        </div>
        {ghToken ? <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/><span className="text-[8px] font-mono text-emerald-500/60 uppercase tracking-wider">Connected</span></span> : <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-wider">Open</span>}
      </button>
      {/* ── Sessions ── */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">{t(lang,'sidebar.sessions')}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={onNew} title="New Session">+</Button>
      </div>
      <Separator/>
      <ScrollArea className="flex-1 px-2 py-1">
        {sessions.slice().reverse().map((s:any)=>
          <div key={s.id} className={'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors group '+ (s.id===activeId?'bg-primary/10 text-primary font-medium':'text-muted-foreground hover:bg-muted hover:text-foreground')} onClick={()=>onSelect(s.id)}>
            <span className="flex-1 truncate">{s.name==='新对话'?t(lang,'chat.newSession'):s.name||t(lang,'chat.newSession')}</span>
            <span className="text-[8px] text-muted-foreground font-mono opacity-0 group-hover:opacity-40 shrink-0">{new Date(s.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            <button className="opacity-0 group-hover:opacity-100 text-destructive text-[10px] px-1 rounded hover:bg-destructive/10 shrink-0" onClick={e=>{e.stopPropagation();onDelete(s.id)}}>×</button>
          </div>
        )}
      </ScrollArea>
      <Separator/>
      {/* Settings + Lab + Login buttons */}
      <div className="px-2 py-1.5 space-y-1 border-t border-border">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2"/></svg>
          <span>{t(lang,'sidebar.settings')}</span>
        </button>
        <button onClick={onOpenLab} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2v6l-3 4h12l-3-4V2"/><line x1="8" y1="11" x2="8" y2="14"/><line x1="3" y1="12" x2="13" y2="12"/></svg>
          <span>{t(lang,'sidebar.lab')}</span>
        </button>
        {auth.user ? (
          <div className="relative" ref={proRef}>
            <button onClick={()=>setProOpen(!proOpen)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              <img src={auth.user.avatar} className="w-5 h-5 rounded-full shrink-0" onError={e=>{(e.target as HTMLImageElement).style.display='none'}}/>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{background:auth.user.avatar||'#6366f1'}}>{auth.user.displayName.slice(0,1).toUpperCase()}</div>
              <span className="truncate">{auth.user.displayName}</span>
              <span className="ml-auto text-[9px] text-muted-foreground/50">▾</span>
            </button>
            {proOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-52 rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in z-[200]">
                <div className="px-3.5 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:auth.user.avatar||'#6366f1'}}>{auth.user.displayName.slice(0,1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{auth.user.displayName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{auth.user.email}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{auth.user.loginMethod}</span>
                  </div>
                </div>
                <div className="px-2 py-1">
                  <button onClick={()=>{d(logoutUser());setProOpen(false)}} className="w-full px-3 py-2 rounded-lg text-left text-xs text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H7"/></svg>
                    {t(lang,'userMenu.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => d(openLoginModal())} className="polaris-login-trigger w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
            <span>{t(lang,'sidebar.login')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Git Panel (collapsible mini-UI inside left sidebar) ── */
/* ── Git Popup (standalone modal, opened from sidebar Git button) ── */
function GitPopup({onClose}:{onClose:()=>void}){
  const d = useAppDispatch();
  const lang = useAppSelector(s=>s.chat.settings.language);
  const ghToken = useAppSelector(s=>s.chat.settings.apiKeys.github);
  const [repoDir, setRepoDir] = useState(localStorage.getItem('polaris_git_dir')||'');
  const [branch, setBranch] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [showCommit, setShowCommit] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [pushMsg, setPushMsg] = useState('');

  const refreshStatus = useCallback(() => {
    if (!repoDir) return;
    setLoading(true);
    const api = window.electronAPI; if (!api) { setLoading(false); return; }
    api.toolsExecute({tool:'git_status', params:{dir:repoDir}}).then((r:any) => {
      if (r.success) { setBranch(r.branch||''); setFiles(r.files||[]); setStatusMsg(''); }
      else { setBranch(''); setFiles([]); setStatusMsg(r.error||'Failed'); }
    }).catch(() => setStatusMsg('Error')).finally(() => setLoading(false));
  }, [repoDir]);

  useEffect(() => { refreshStatus(); const t = setInterval(refreshStatus, 30000); return () => clearInterval(t); }, [refreshStatus]);

  const handleClone = async () => {
    if (!cloneUrl.includes('github.com')) return;
    setLoading(true);
    const api = window.electronAPI; if (!api) return;
    const r = await api.toolsExecute({tool:'git_clone', params:{url:cloneUrl}});
    if (r.success && r.dir) { setRepoDir(r.dir); localStorage.setItem('polaris_git_dir', r.dir); setCloneUrl(''); refreshStatus(); }
    else { setStatusMsg(r.error||'Clone failed'); }
    setLoading(false);
  };

  const handlePush = async () => {
    setLoading(true); setPushMsg('');
    const api = window.electronAPI; if (!api) return;
    const r = await api.toolsExecute({tool:'git_push', params:{dir:repoDir}});
    if (r.success) {
      setPushMsg('Push OK. Creating PR...');
      const pr = await api.toolsExecute({tool:'git_create_pr', params:{dir:repoDir, title:'Polaris Agent Update', body:'Changes made via Polaris Solver.'}});
      if (pr.success) { setPushMsg(pr.pr_url||'PR created'); }
      else { setPushMsg('Push OK. PR: ' + (pr.error||'skipped')); }
    } else { setPushMsg(r.error||'Push failed'); }
    setLoading(false); refreshStatus();
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setLoading(true);
    const api = window.electronAPI; if (!api) return;
    const r = await api.toolsExecute({tool:'git_commit', params:{dir:repoDir, message:commitMsg}});
    if (r.success) { setCommitMsg(''); setShowCommit(false); refreshStatus(); }
    else { setStatusMsg(r.error||'Commit failed'); }
    setLoading(false);
  };

  return(
    <div className="fixed inset-0 z-[300] bg-black/30 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-[480px] max-w-[94vw] max-h-[80vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2v2.5M8 4.5a2 2 0 100 4 2 2 0 000-4zM4 11v2.5M12 11v2.5M8 8.5v4"/><circle cx="4" cy="13.5" r="1.3"/><circle cx="12" cy="13.5" r="1.3"/><path d="M4 11c0-1.5 1-2.5 1.5-2.5M12 11c0-1.5-1-2.5-1.5-2.5"/></svg>
            <span className="text-sm font-semibold text-foreground font-mono">git</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">Close</button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[260px]">
          {/* No GitHub token → Connect GitHub prompt */}
          {!ghToken ? (
            <div className="text-center py-10 space-y-4">
              <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor" className="mx-auto text-muted-foreground/30"><path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              <div>
                <p className="text-sm text-foreground font-medium">Connect GitHub Account</p>
                <p className="text-[11px] text-muted-foreground mt-1">Use Device Flow — no password needed. A one-time code will be shown on screen for you to enter on github.com.</p>
              </div>
              <button className="px-6 py-2.5 rounded-lg bg-[#24292f] hover:bg-[#1b1f23] text-xs text-white font-medium transition-colors" onClick={()=>{onClose();(window as any).__pol_github_tab=true;d(openLoginModal())}}>Connect GitHub Account</button>
            </div>
          ) : !repoDir ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Clone a repository to enable version control.</p>
              <div className="flex gap-2">
                <input className="flex-1 bg-muted border border-border rounded-lg px-3 py-2.5 text-xs font-mono outline-none focus:border-primary/50" placeholder="https://github.com/user/repo.git" value={cloneUrl} onChange={e=>setCloneUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleClone()}}/>
                <button className="px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-xs text-primary-foreground font-medium transition-colors shrink-0" onClick={handleClone} disabled={loading||!cloneUrl.includes('github')}>{loading?'...':'Clone'}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Branch + status bar */}
              <div className="flex items-center gap-2 text-xs">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v2.5M8 4.5a2 2 0 100 4 2 2 0 000-4zM4 11v2.5M12 11v2.5M8 8.5v4"/><circle cx="4" cy="13.5" r="1.3"/><circle cx="12" cy="13.5" r="1.3"/><path d="M4 11c0-1.5 1-2.5 1.5-2.5M12 11c0-1.5-1-2.5-1.5-2.5"/></svg>
                <span className="font-mono text-emerald-400">{branch||'main'}</span>
                <span className="text-muted-foreground/50 mx-1">/</span>
                <span className="font-mono text-muted-foreground">{files.length} file{(files.length!==1?'s':'')}</span>
                <button onClick={refreshStatus} className="ml-auto text-muted-foreground hover:text-foreground text-xs font-mono" disabled={loading}>{loading?'...':'Refresh'}</button>
              </div>

              {/* Changed files */}
              {files.length>0 && (
                <div className="rounded-lg bg-muted/30 border border-border/50 overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted/50 border-b border-border/50 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Staged Changes</div>
                  <div className="max-h-[140px] overflow-y-auto p-2 space-y-0.5">
                    {files.map((f,i)=><div key={i} className="text-[10px] font-mono text-foreground/80 px-2 py-0.5 rounded hover:bg-muted/50">{f.trim()}</div>)}
                  </div>
                </div>
              )}
              {files.length===0&&!loading&&<div className="text-center py-6 text-muted-foreground text-xs font-mono">Working tree clean</div>}

              {/* Commit input */}
              {files.length>0 && (showCommit ? (
                <div className="space-y-2">
                  <input className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-xs font-mono outline-none focus:border-primary/50" placeholder="Commit message" value={commitMsg} onChange={e=>setCommitMsg(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleCommit()}} autoFocus/>
                  <div className="flex gap-2">
                    <button className="flex-1 py-2 rounded-lg bg-muted hover:bg-muted/70 text-xs text-muted-foreground font-mono transition-colors" onClick={()=>setShowCommit(false)}>Cancel</button>
                    <button className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium transition-colors" onClick={handleCommit} disabled={loading||!commitMsg.trim()}>{loading?'Committing...':'Commit'}</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="flex-1 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-xs text-primary font-medium transition-colors" onClick={()=>setShowCommit(true)}>Commit</button>
                  <button className="flex-1 py-2.5 rounded-lg bg-muted hover:bg-muted/70 text-xs text-muted-foreground font-medium transition-colors" onClick={handlePush} disabled={loading}>{loading?'...':'Push & PR'}</button>
                </div>
              ))}

              {/* Push result */}
              {pushMsg && (
                <div className="text-[10px] font-mono p-2.5 rounded-lg bg-muted/30 border border-border/50 text-muted-foreground truncate">{pushMsg}</div>
              )}
              {statusMsg && <div className="text-[10px] text-red-400 font-mono">{statusMsg}</div>}
            </div>
          )}
        </div>
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
  const[permReq,setPermReq]=useState<any>(null); // Claude-style permission request
  const[execLog,setExecLog]=useState<{id:string;time:string;tool:string;status:'running'|'done'|'error';detail:string}[]>([]);
  const[todoSteps,setTodoSteps]=useState<{id:string;status:'pending'|'running'|'done';label:string}[]>([]);
  const[interventions,setInterventions]=useState<any[]>([]);
  const[plan,setPlan]=useState<any>(null);const[planProg,setPlanProg]=useState<any>(null);const[planId,setPlanId]=useState('');
  const[labOpen,setLabOpen]=useState(false);
  const[gitOpen,setGitOpen]=useState(false);

  // Panel widths (px) & visibility
  const[leftW,setLeftW]=useState(220);const[leftOpen,setLeftOpen]=useState(true);
  const[rightW,setRightW]=useState(280);const[rightOpen,setRightOpen]=useState(false);

  const dispatchRef=useRef(d);useEffect(()=>{dispatchRef.current=d},[d]);
  const stop=useRef(false);
  const act=useMemo(()=>sessions.find(s=>s.id===activeSessionId),[sessions,activeSessionId]);

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
    document.documentElement.classList.toggle('light',settings.theme==='light');
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
        document.documentElement.classList.toggle('light',saved.theme==='light');
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
  api.onToolConfirm((data:any)=>{setPermReq(data)});api.onToolConfirmDismiss((data:any)=>{setPermReq(function(p:any){return p&&p.id===data.id?null:p})});
  // Health check
  api.healthCheck().then((r:any)=>{if(Array.isArray(r)){const s={python:false,polaris:false,highs:false,deepseek:false};r.forEach((x:any)=>{if(x.service==='Python')s.python=x.ok;if(x.service==='Polaris Engine')s.polaris=x.ok;if(x.service==='HiGHS Solver')s.highs=x.ok;if(x.service==='DeepSeek API')s.deepseek=x.ok;});d(setEngineStatus(s))}}).catch(()=>{});
  let kc=0;const onKb=()=>{kc++;if(kc%30===0)api.monitorUpdate({count:kc,lastPress:Date.now(),window:document.title})};window.addEventListener('keydown',onKb);return()=>window.removeEventListener('keydown',onKb)},[]);
  var lang = settings.language;
  useEffect(function(){document.documentElement.classList.toggle('dark',settings.theme==='dark');document.documentElement.classList.toggle('light',settings.theme==='light');document.documentElement.style.fontSize=settings.fontSize+'px';document.documentElement.lang=lang},[settings.theme,settings.fontSize,lang]);
  // ── Auto usage tracker (background, writes to localStorage) ──
  useEffect(function(){try{var d=JSON.parse(localStorage.getItem('polaris_usage_stats')||'{}');d.calls=(d.calls||0)+(sc.contextTokens.used>0?1:0);d.totalTokens=(d.totalTokens||0)+sc.contextTokens.used;d.lastUpdate=new Date().toISOString();localStorage.setItem('polaris_usage_stats',JSON.stringify(d));}catch{}},[sc.contextTokens.used]);

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
        resetSafety(); // Each chunk resets the timeout
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
      // Smart timeout — 120s max, resets on each chunk
      var safetyTimer; var timeoutMs = 120000;
      var resetSafety = function() {
        if (safetyTimer) clearTimeout(safetyTimer);
        safetyTimer = setTimeout(function() {
          if (!hasAdded) { fullContent = fullContent || '*响应超时，请重试*'; d(addMessage({ sessionId: sid, message: { id: msgId, role: 'assistant', content: fullContent, timestamp: Date.now() } })); }
          d(incrementUsage()); d(setStreaming(false)); setThinking(''); setThk('');
          streamApi.removeStreamListeners();
        }, timeoutMs);
      };
      resetSafety();
      await streamApi.queryStream({text:ctx,strategy,apiKeys:settings.apiKeys,language:settings.language});
      if (safetyTimer) clearTimeout(safetyTimer);
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
        sessions={sessions} activeId={activeSessionId}
        onSelect={(id:any)=>d(setActiveSession(id))}
        onNew={()=>d(ns())}
        onDelete={(id)=>d(deleteSession(id))}
        onOpenSettings={()=>d(toggleSettings())}
        onOpenLab={()=>setLabOpen(true)}
        onOpenGit={()=>setGitOpen(true)}
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
    msgList = <div className="empty-state"><div className="empty-state-icon">P</div><div className="empty-state-title">{t(lang,'chat.emptyTitle')}</div><div className="empty-state-desc">{t(lang,'chat.emptyDesc')}</div></div>;
  } else {
    msgList = act.messages.map((m:any,i:number)=>{
      var isLast=i===act.messages.length-1;
      if (m.role==='user') return <div key={m.id} className="msg-row user"><div className="msg-bubble usr">{m.content}</div></div>;
      var dlBlocks=[];var matches=m.content.matchAll(/```(python|py|code)\n([\s\S]*?)```/g);for(var match of matches)dlBlocks.push({lang:match[1],code:match[2].trim()});
      var dlEl=dlBlocks.length>0?<div className="flex gap-1 mt-2">{dlBlocks.map(function(b:any,j:number){return <button key={j} className="msg-act-btn" style={{fontSize:10,padding:'2px 10px'}} onClick={function(){var blob=new Blob([b.code],{type:'text/plain'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=b.lang==='py'?'model.py':(b.lang+'.py');a.click()}}>Download {b.lang}</button>})}</div>:null;
      return <div key={m.id} className="msg-row assistant"><div className="msg-bubble assistant">
        {(m.model||m.routing)&&<div className="msg-meta">
          {m.routing?.intent&&<span className="intent-tag">{m.routing.intent}</span>}
          {m.routing?.models?.map((md:any,j:number)=><span key={j} className="model-tag">{md}</span>)}
          {m.model&&<span className="model-tag">{m.model}</span>}
        </div>}
        <div dangerouslySetInnerHTML={{__html:md(m.content)}}/>
        {dlEl}
        {isLast&&<div className="msg-actions">
          <button className="msg-act-btn" title="Copy" onClick={()=>cp(m.content)}>{cid===m.content.slice(0,20)?'OK':'Copy'}</button>
          <button className="msg-act-btn" title="Retry" onClick={rg}>↻</button>
          <button className="msg-act-btn" title="Branch" onClick={br}>⑂</button>
        </div>}
      </div></div>;
    });
  }

  var thinkingEl=(thk||thinking)?<div className="think-indicator"><div className="think-dots"><span/><span/><span/></div>{thinking||thk||t(lang,'chat.thinking')}</div>:null;

  return <div>
    {toastEl}
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Titlebar ── */}
      <div className="titlebar drag">
        <div className="titlebar-left no-drag">
          <span className="titlebar-logo">Polaris</span>
          <span className="titlebar-badge">SOLVER</span>
          {thk?<span className="titlebar-status animate-pulse">{thk}</span>:null}
        </div>
        <div className="titlebar-right no-drag">
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
                placeholder={t(lang,'chat.placeholder')}
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
    {labOpen && <StandaloneLab onClose={()=>setLabOpen(false)}/>}
    {gitOpen && <GitPopup onClose={()=>setGitOpen(false)}/>}
    <LoginModal/>
    {/* ── Claude Code-style Permission Dialog ── */}
    {permReq&&<div className="perm-dialog" onClick={()=>{var api=window.electronAPI;if(api)api.rejectPermission(permReq.id);setPermReq(null)}}>
      <div className="perm-card" onClick={e=>e.stopPropagation()}>
        <div className="perm-header">
          <div className="perm-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
          <div><div className="perm-title">Polaris requests permission</div><div className="perm-subtitle">Agent wants to perform this action</div></div>
        </div>
        <div className="perm-body">
          <div className="perm-tool-name">{permReq.tool}{permReq.displayName?' — '+permReq.displayName:''}</div>
          {permReq.params&&Object.keys(permReq.params).length>0&&<div className="perm-params">
            {Object.keys(permReq.params).map(function(k){return<div key={k} className="perm-param-row"><span className="perm-param-key">{k}</span><span className="perm-param-val">{String(permReq.params[k]).slice(0,200)}</span></div>})}
          </div>}
        </div>
        <div className="perm-footer">
          <button className="perm-btn" onClick={()=>{var api=window.electronAPI;if(api)api.rejectPermission(permReq.id);setPermReq(null)}}>Deny</button>
          <button className="perm-btn approve" onClick={()=>{var api=window.electronAPI;if(api)api.approvePermission(permReq.id);setPermReq(null)}}>Allow</button>
        </div>
      </div>
    </div>}
  </div>;
};

/* ── Strategy Selector ── */
function StrategySelector(){
  var d=useAppDispatch();var st=useAppSelector(function(s){return s.chat.strategy});var l=useAppSelector(function(s){return s.chat.settings.language});
  var labels=l==='zh-CN'?{fast:'快速',quality:'优质',expert:'专家'}:l==='ja'?{fast:'高速',quality:'品質',expert:'専門家'}:l==='fr'?{fast:'Rapide',quality:'Qualité',expert:'Expert'}:{fast:'Fast',quality:'Quality',expert:'Expert'};
  var modes=[{id:'cost_optimized',label:labels.fast,hint:'Low token'},{id:'best_quality',label:labels.quality,hint:'Medium token'},{id:'ensemble',label:labels.expert,hint:'High token'}];
  return React.createElement('div',{className:'strategy-selector'},
    modes.map(function(m,i){
      var isActive=st===m.id;
      return React.createElement('button',{key:m.id,onClick:function(){d(setStrategy(m.id));},className:'strategy-btn'+(isActive?' active':''),title:m.hint},m.label);
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
