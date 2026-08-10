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
import{GitPopup}from'./components/GitPopup';
import{TaskBoard}from'./components/TaskBoard';
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
  }

  var rightPanel = null;
  if (rightOpen) {
    rightPanel = <div key="right" style={{display:'flex',flexShrink:0}}>
      <div onMouseDown={resizeRight} style={{width:4,cursor:'ew-resize',flexShrink:0}}/>
      <div style={{width:rightW}} className="shrink-0 bg-card border-l border-border h-full overflow-hidden">
        <TaskBoard execLog={execLog} todoSteps={todoSteps} plan={plan} planProg={planProg}/>
        {plan && plan.steps && (
          <div className="flex gap-2 px-3 py-2 border-t border-border bg-muted/10 shrink-0">
            <button className="flex-1 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-[10px] text-primary font-mono font-medium transition-colors" onClick={confirmPlan}>Run</button>
            <button className="flex-1 py-1.5 rounded-md bg-muted/30 hover:bg-muted/50 text-[10px] text-muted-foreground font-mono transition-colors" onClick={()=>{stop.current=true;d(setStreaming(false));rejectPlan()}}>Stop</button>
          </div>
        )}
      </div>
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
