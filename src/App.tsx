import React,{useState,useCallback,useRef,useEffect,useMemo}from'react';
import{useAppSelector,useAppDispatch}from'./store';
import{addMessage,editMessage,loadSessions as lr,newSession as ns,setActiveSession,setStreaming,setStrategy,toggleSidebar,toggleSettings,setTheme,deleteSession,branchSession,addMemory}from'./store/chatSlice';
import type{ChatMessage,Strategy}from'./store/chatSlice';
import{saveSessions,loadSessions as ld}from'./store/persist';
import SettingsPanel from'./components/SettingsPanel';

const SUGGESTIONS=['帮我写一封给投资人的项目介绍邮件','用 Python 写一个多线程下载器','分析对比特斯拉和比亚迪的竞争格局','帮我整理桌面上的文档文件'];
const WinBtns=()=>(<div className="wb-row"><button onClick={()=>window.electronAPI?.minimize()}className="wb">─</button><button onClick={()=>window.electronAPI?.maximize()}className="wb">□</button><button onClick={()=>window.electronAPI?.close()}className="wb wb-close">✕</button></div>);

/* === Message Row — clean, Apple-style === */
const MsgRow:React.FC<{msg:ChatMessage;isLast:boolean;onCopy:()=>void;onRegen:()=>void;onEdit:(v:string)=>void;onBranch:()=>void;cid:boolean}>=({msg,isLast,onCopy,onRegen,onEdit,onBranch,cid})=>{
  const[ed,setEd]=useState(false);const[v,setV]=useState(msg.content);const[rtOpen,setRtOpen]=useState(false);
  if(msg.role==='user')return(<div className="msg-row u"><div className="ub">{msg.content}{msg.edited&&<span className="ed">(已编辑)</span>}</div></div>);
  return(<div className="msg-row"><div className="ab">
    {msg.routing&&<div className="rt-wrap"><button className="rt-toggle"onClick={()=>setRtOpen(!rtOpen)}>{rtOpen?'▾':'▸'} {msg.routing.intent}{msg.routing.models.length>1?' · '+msg.routing.models.length+' 模型':''}</button><div className={'rt-body'+(rtOpen?' open':'')}><span className="rt-i">{msg.routing.intent}</span>→{msg.routing.models.map((m,i)=><span key={i}className="rt-m">{m}</span>)}<span style={{fontSize:8,opacity:.5}}>{msg.routing.rationale?.slice(0,40)}</span></div></div>}
    {ed?(<div><textarea className="ed-tx"value={v}onChange={e=>setV(e.target.value)}rows={6}/><div className="ed-bar"><button onClick={()=>{onEdit(v);setEd(false)}}className="ed-bt">保存</button><button onClick={()=>setEd(false)}className="ed-bt ed-c">取消</button></div></div>):<div dangerouslySetInnerHTML={{__html:md(msg.content)}}/>}
    <div className="ab-ft"><span className="ab-md">{msg.model||''}</span><span className="ab-act"><button onClick={onCopy}title="复制">{cid?'✓':'⎘'}</button>{isLast&&<><button onClick={onRegen}title="重新生成">↻</button><button onClick={onBranch}title="分支">⑂</button></>}<button onClick={()=>{setEd(true);setV(msg.content)}}title="编辑">✎</button></span></div>
  </div></div>);
};

/* === Command Palette === */
const CmdPalette:React.FC<{onClose:()=>void;onCommand:(cmd:string)=>void}>=({onClose,onCommand})=>{
  const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);const[q,setQ]=useState('');const cmds=useMemo(()=>{const all=[
    {id:'quality',l:'优质模式',k:'✦',a:()=>{d(setStrategy('best_quality'));onClose()}},
    {id:'cost',l:'省钱模式',k:'◆',a:()=>{d(setStrategy('cost_optimized'));onClose()}},
    {id:'ensemble',l:'协同模式',k:'◈',a:()=>{d(setStrategy('ensemble'));onClose()}},
    {id:'new',l:'新建对话',k:'Ctrl+N',a:()=>{d(ns());onClose()}},
    {id:'sidebar',l:'侧边栏',k:'Ctrl+B',a:()=>{d(toggleSidebar());onClose()}},
    {id:'settings',l:'设置',k:'Ctrl+,',a:()=>{d(toggleSettings());onClose()}},
    {id:'export',l:'导出 Markdown',k:'',a:()=>{onCommand('export');onClose()}},
    {id:'theme',l:'切换主题',k:'',a:()=>{const ts=sc.settings.theme==='dark'?'light':'dark';d(setTheme(ts));onClose()}},
  ];return q?all.filter(x=>x.l.toLowerCase().includes(q.toLowerCase())):all},[q,d,onClose,sc.settings.theme,onCommand]);
  return(<div className="cp-overlay"onClick={onClose}><div className="cp-box"onClick={e=>e.stopPropagation()}><input className="cp-in"autoFocus value={q}onChange={e=>setQ(e.target.value)}placeholder="搜索命令..."/><div className="cp-list">{cmds.map(c=><div key={c.id}className="cp-item"onClick={c.a}><span>{c.l}</span><span className="cp-kbd">{c.k}</span></div>)}</div></div></div>);
};

/* === Intervention Card === */
const IntCard:React.FC<{card:any;onConfirm:(c:any)=>void;onDismiss:(c:any)=>void}>=({card,onConfirm,onDismiss})=>(<div className={`int-card L${card.level||2}`}><span className="int-icon">{card.level===3?'⚠':card.level===2?'💡':'✨'}</span><span className="int-body">{card.body}</span><div className="int-acts">{card.actions?card.actions.map((a:any)=><button key={a.label}className="int-btn"onClick={()=>a.action==='dismiss'?onDismiss(card):onConfirm(card)}>{a.label}</button>):<><button className="int-btn"onClick={()=>onConfirm(card)}>处理</button><button className="int-btn"onClick={()=>onDismiss(card)}>忽略</button></>}</div></div>);

/* === Plan Card === */
const PlanCard:React.FC<{plan:any;onConfirm:()=>void;onReject:()=>void;progress:any}>=({plan,onConfirm,onReject,progress})=>(<div className="plan-card"><div className="plan-hdr"><span className="plan-title">执行计划</span></div><p className="plan-req">{plan.request?.slice(0,80)}</p><div className="plan-steps">{plan.steps?.map((s:any)=><div key={s.id}className={`plan-step${progress&&progress.step===s.id?' active':''}${progress&&progress.step===s.id&&progress.type==='step_done'?' done':''}`}><span className="ps-check">{progress&&progress.step===s.id&&progress.type==='step_done'?'✓':progress&&progress.step===s.id?'●':'○'}</span><span>{s.description}</span><span className="ps-risk"style={{color:s.risk==='high'?'var(--red)':''}}>{s.risk}</span></div>)}</div><div className="plan-acts">{!progress?<><button className="plan-btn plan-yes"onClick={onConfirm}>确认执行</button><button className="plan-btn plan-no"onClick={onReject}>取消</button></>:<button className="plan-btn plan-no"onClick={onReject}>停止</button>}</div></div>);

/* ====== Main App ====== */
const App:React.FC=()=>{
  const d=useAppDispatch();const sc=useAppSelector(s=>s.chat);
  const{sessions,activeSessionId,streaming,strategy,sidebarOpen,settingsOpen,settings,contextTokens}=sc;
  const[inp,setInp]=useState('');const[thk,setThk]=useState('');
  const cr=useRef<HTMLDivElement>(null);const ir=useRef<HTMLTextAreaElement>(null);
  const[fs,setFs]=useState<{u:string;n:string;t?:string}[]>([]);
  const[cid,setCid]=useState('');const[tpl,setTpl]=useState(false);const[web,setWeb]=useState(false);
  const[drag,setDrag]=useState(false);const[cmd,setCmd]=useState(false);
  const stop=useRef(false);const act=sessions.find(s=>s.id===activeSessionId);
  // Intervention + Planner state
  const[interventions,setInterventions]=useState<any[]>([]);
  const[plan,setPlan]=useState<any>(null);const[planProg,setPlanProg]=useState<any>(null);const[planId,setPlanId]=useState('');
  const pct=contextTokens.total>0?Math.min(Math.round(contextTokens.used/Math.max(contextTokens.total,1)*100),100):0;

  /* Effects */
  useEffect(()=>{document.documentElement.setAttribute('data-theme',settings.theme)},[settings.theme]);
  useEffect(()=>{d(setTheme(settings.theme));const s=ld();if(s.length>0)d(lr(s))},[]);
  useEffect(()=>{if(sessions.length>0){const t=setTimeout(()=>saveSessions(sessions),500);return()=>clearTimeout(t)}},[sessions]);
  useEffect(()=>{cr.current?.scrollTo({top:cr.current.scrollHeight,behavior:'smooth'})},[act?.messages,thk,interventions]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='p'){e.preventDefault();setCmd(true)}if(e.key==='Escape'){stop.current=true;d(setStreaming(false));setThk('');setCmd(false)}if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();d(ns())}if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();d(toggleSidebar())}if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();d(toggleSettings())}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[d]);
  /* System monitor */
  useEffect(()=>{const api=window.electronAPI;if(!api)return;api.monitorStart();api.onIntervention((card:any)=>{card.ts=Date.now();setInterventions(p=>[...p.slice(-4),card])});api.onPlanProgress((data:any)=>setPlanProg(data));let kc=0;const onKb=()=>{kc++;if(kc%30===0)api.monitorUpdate({count:kc,lastPress:Date.now(),window:document.title})};window.addEventListener('keydown',onKb);return()=>window.removeEventListener('keydown',onKb)},[]);

  /* Query */
  const query=useCallback(async(t:string,rgn?:boolean)=>{
    if(!t||streaming)return;stop.current=false;
    const imgs=fs.filter(f=>f.u.startsWith('data:image')).map(f=>f.u);
    const txts=fs.filter(f=>f.t).map(f=>'[文件: '+f.n+']\n'+f.t).join('\n');
    setInp('');setFs([]);
    if(!rgn){d(addMessage({sessionId:activeSessionId!,message:{id:'u'+Date.now(),role:'user',content:t,timestamp:Date.now()}}))}
    d(setStreaming(true));setThk('思考中...');
    /* Check if desktop automation request */
    if(/[打开|执行|整理|搜索|移动]/.test(t)&&!/写|代码|翻译|分析|解释|是什么|怎么|为什么|对比/.test(t)){
      try{const api=window.electronAPI;if(!api)throw new Error('未就绪');const p=await api.plannerGenerate(t);setPlan(p);setPlanId(p.id);d(setStreaming(false));setThk('');return}catch{}}
    /* Normal AI query */
    try{let ctx=t;if(txts)ctx+='\n\n'+txts;
      if(web){try{const{webSearch}=await import('./utils/search');const r=await webSearch(t,settings.apiKeys.serper);if(r.length>0&&!r[0].title.includes('未配置'))ctx+='\n[搜索]\n'+r.map((x:any)=>'- '+x.title+': '+x.snippet).join('\n')}catch{}}
      const api=window.electronAPI;if(!api)throw new Error('API未就绪');
      let res;
      try{res=await api.queryStream({text:ctx,strategy,apiKeys:settings.apiKeys});if(stop.current)return}catch{res=await api.query({text:ctx,strategy,apiKeys:settings.apiKeys})}
      if(stop.current)return;setThk(res.routing?.selected_models?.join(', ')||'');
      let cnt=res.responses?.map((r:any)=>r.content||'').join('\n\n---\n\n')||'';
      if(res.workflow_steps?.length){cnt='**[工作流]**\n'+res.workflow_steps.map((s:any)=>(s.error?'✗ ':'✓ ')+s.id+': '+s.agent).join('\n')+'\n\n---\n\n'+cnt}
      if(res.ensemble?.disagreements?.length){cnt+='\n\n⚠️ **合奏分歧:**\n'+res.ensemble.disagreements.map((d:any)=>'> ['+d.type+'] '+d.model_a+' vs '+d.model_b).join('\n')}
      if(settings.memory.enabled&&cnt.length>50)d(addMemory({key:t.slice(0,40),value:cnt.slice(0,200)}));
      d(addMessage({sessionId:activeSessionId!,message:{id:'a'+Date.now(),role:'assistant',content:cnt,timestamp:Date.now(),model:res.routing?.selected_models?.join(', ')||'',routing:{intent:res.routing?.top_intent,models:res.routing?.selected_models||[],rationale:res.routing?.rationale||''}}}));
    }catch(e:any){if(!stop.current)d(addMessage({sessionId:activeSessionId!,message:{id:'e'+Date.now(),role:'assistant',content:'❌ '+(e.message||'连接失败'),timestamp:Date.now()}}))}
    d(setStreaming(false));setThk('');
  },[streaming,strategy,activeSessionId,d,fs,web,settings]);

  /* Actions */
  const send=()=>{const t=inp.trim();if(!t||streaming)return;query(t)}
  const cp=(c:string)=>{navigator.clipboard.writeText(c).catch(()=>{});setCid(c.slice(0,20));setTimeout(()=>setCid(''),1500)}
  const rg=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)query(u.content,true)}
  const em=(v:string)=>{if(!act)return;const a=[...act.messages].reverse().find(m=>m.role==='assistant');if(a)d(editMessage({sessionId:act.id,messageId:a.id,content:v}))}
  const br=()=>{if(!act||act.messages.length<2)return;const u=[...act.messages].reverse().find(m=>m.role==='user');if(u)d(branchSession({sourceSessionId:act.id,upToMessageId:u.id}))}
  const ex=()=>{if(!act||act.messages.length===0)return;const md2=act.messages.map(m=>'### '+(m.role==='user'?'用户':'AI')+'\n\n'+m.content+'\n').join('\n---\n');const b=new Blob([md2],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(act.name||'对话')+'.md';a.click()}
  const dp=async(e:React.DragEvent)=>{e.preventDefault();setDrag(false);for(const f of Array.from(e.dataTransfer.files)){if(f.type.startsWith('image/')){const r=new FileReader();r.onload=()=>setFs(p=>[...p,{u:r.result as string,n:f.name}]);r.readAsDataURL(f);continue}try{const t=await f.text();setFs(p=>[...p,{u:'',n:f.name,t:t.slice(0,5000)}])}catch{}}}
  const useTpl=(prompt:string)=>{d(ns());setTimeout(()=>{setInp(prompt);ir.current?.focus();},100)}
  const handleCmd=(cmd:string)=>{if(cmd==='export')ex()}
  /* Planner */
  const confirmPlan=async()=>{if(!planId)return;const api=window.electronAPI;if(!api)return;setThk('执行中...');d(setStreaming(true));try{await api.plannerExecute(planId);setPlan(null);setPlanId('');setPlanProg(null);d(addMessage({sessionId:activeSessionId!,message:{id:'p'+Date.now(),role:'assistant',content:'✓ 计划执行完毕',timestamp:Date.now(),model:'Polaris Planner'}}))}catch(e:any){d(addMessage({sessionId:activeSessionId!,message:{id:'e'+Date.now(),role:'assistant',content:'❌ '+e.message,timestamp:Date.now()}}))}d(setStreaming(false));setThk('')}
  const rejectPlan=async()=>{const api=window.electronAPI;if(!api)return;await api.plannerReject(planId);setPlan(null);setPlanId('');setPlanProg(null)}
  const confInt=(card:any)=>{const api=window.electronAPI;if(api&&card.eventKey)api.monitorFeedback({eventKey:card.eventKey,accepted:true});setInterventions(p=>p.filter(c=>c.ts!==card.ts))}
  const dismInt=(card:any)=>{const api=window.electronAPI;if(api&&card.eventKey)api.monitorFeedback({eventKey:card.eventKey,accepted:false});setInterventions(p=>p.filter(c=>c.ts!==card.ts))}

  /* Sidebar content */
  const SidebarContent=()=>{const[tab,setTab]=useState('chats');return(<div className="side"><div className="side-hd"><span className="side-logo">POLARIS</span><button className="side-cl"onClick={()=>d(toggleSidebar())}>✕</button></div><div className="side-tabs"><button className={'side-tb'+(tab==='chats'?' on':'')}onClick={()=>setTab('chats')}>💬 对话</button><button className={'side-tb'+(tab==='tools'?' on':'')}onClick={()=>setTab('tools')}>📋 工具</button></div><button className="side-new"onClick={()=>d(ns())}>+ 新建对话</button>
    {tab==='chats'&&<><div className="side-srch"><input placeholder="搜索对话..."/></div><div className="side-list">{sessions.slice().reverse().map(s=>(<div key={s.id}className={'side-it'+(s.id===activeSessionId?' on':'')}onClick={()=>d(setActiveSession(s.id))}><span className="side-dot"/><span className="side-nm">{s.name||'新对话'}</span><span className="side-dt">{new Date(s.createdAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</span><button className="side-del"onClick={e=>{e.stopPropagation();d(deleteSession(s.id))}}>✕</button></div>))}</div></>}
    {tab==='tools'&&<div className="side-section"><div className="side-section-title">模型策略</div><div className="side-strat-row">{(['best_quality','cost_optimized','ensemble']as Strategy[]).map(s=><button key={s}className={'side-strat'+(strategy===s?' on':'')}onClick={()=>d(setStrategy(s))}>{{best_quality:'✦ 优质',cost_optimized:'◆ 省钱',ensemble:'◈ 协同'}[s]}</button>)}</div><div className="side-section-title">快捷键</div><div className="side-tpl-items">{[{k:'Ctrl+P',v:'命令面板'},{k:'Ctrl+N',v:'新建对话'},{k:'Ctrl+B',v:'侧边栏'},{k:'Ctrl+,',v:'设置'},{k:'Enter',v:'发送'},{k:'Esc',v:'停止'}].map(x=><div key={x.k}className="side-tpl-item">{x.k} — {x.v}</div>)}</div></div>}
    <div className="side-ft"><div className="side-ft-bar"><div className="side-ft-bar-fill"style={{width:pct+'%'}}/></div><span>{pct}% tokens</span></div></div>);};

  /* Current model display */
  const activeModel=sc.settings.apiKeys.anthropic?'Claude Sonnet 4':sc.settings.apiKeys.openai?'GPT-4o':'DeepSeek V4 Flash';

  return(<div className="app"onDragOver={e=>{e.preventDefault();setDrag(true)}}onDragLeave={()=>setDrag(false)}onDrop={dp}>
    {/* Titlebar */}
    <div className="tb"><div className="tb-l"><span className="tb-lg">✦ Polaris</span><span className="tb-ver">v1.0</span><span className="tb-active-model">{activeModel}</span><span className="tb-tokens">{contextTokens.used>0?Math.round(contextTokens.used/1000)+'k':''} tokens</span></div><div className="tb-r"><button className="tb-btn"onClick={()=>d(toggleSidebar())}title="侧边栏 Ctrl+B">☰</button><button className="tb-btn"onClick={()=>setCmd(true)}title="命令面板 Ctrl+P">⌘</button><button className="tb-btn"onClick={ex}title="导出">↓</button><button className="tb-btn"onClick={()=>d(toggleSettings())}title="设置 Ctrl+,">⚙</button><WinBtns/></div></div>
    {drag&&<div className="dov"><div className="doz"><p>拖拽文件到此处上传</p></div></div>}
    {fs.length>0&&<div className="fb">{fs.map((f,i)=><div key={i}className="fc"><span>{f.n}</span><button onClick={()=>setFs(p=>p.filter((_,j)=>j!==i))}className="fcx">✕</button></div>)}</div>}

    <div className="body">
      {sidebarOpen&&<SidebarContent/>}
      <div className="main">
        <div className="chat"ref={cr}>
          {/* Interventions */}
          {interventions.map(c=><IntCard key={c.ts||c.timestamp}card={c}onConfirm={confInt}onDismiss={dismInt}/>)}
          {/* Plan card */}
          {plan&&<PlanCard plan={plan}onConfirm={confirmPlan}onReject={rejectPlan}progress={planProg}/>}
          {/* Messages */}
          {(!act||act.messages.length===0)?(<div className="empty"><div className="empty-icon">✦</div><h2>有什么我可以帮你的？</h2><p className="eh">Ctrl+P 命令面板 · Ctrl+N 新建 · 拖拽文件 · 语音输入</p><div className="esg">{SUGGESTIONS.map((s,i)=><button key={i}className="es"onClick={()=>{setInp(s);ir.current?.focus()}}>{s}</button>)}</div></div>):(act.messages.map((m,i)=><MsgRow key={m.id}msg={m}isLast={i===act.messages.length-1}onCopy={()=>cp(m.content)}onRegen={rg}onEdit={em}onBranch={br}cid={cid===m.content.slice(0,20)}/>))}
          {thk&&<div className="tm"><div className="tm-d"/><span>{thk}</span></div>}
        </div>

        {/* Input Area */}
        <div className="ia">
          {tpl&&<div className="tpp">{settings.promptTemplates.map(t=><button key={t.id}className="tpi"onClick={()=>{setInp(t.content);setTpl(false);ir.current?.focus()}}><span className="tpn">{t.name}</span><span className="tpc">{t.category}</span></button>)}</div>}
          <div className="ia-card">
            <div className="irr">
              <textarea ref={ir}className="itx"value={inp}onChange={e=>{setInp(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,180)+'px'}}onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}if(e.key==='/'&&!inp){e.preventDefault();setCmd(true)}}}placeholder="向 Polaris 提问，或按 / 使用命令..."rows={1}disabled={streaming}/>
              <div className="ia-actions">
                <button className={`ia-btn${web?' on':''}`}onClick={()=>setWeb(!web)}title="联网搜索">🌐</button>
                <button className="ia-btn"onClick={async()=>{try{const{startListening}=await import('./utils/voice');startListening('zh-CN',(t:string)=>{setInp(p=>p+t)},()=>{})}catch{}}}disabled={streaming}title="语音输入">🎤</button>
                {streaming?<button className="ia-st"onClick={()=>{stop.current=true;d(setStreaming(false));setThk('')}}>■</button>:<button className="ia-send"onClick={send}disabled={!inp.trim()}>↑</button>}
              </div>
            </div>
            <div className="ia-status"><span>✦ {{best_quality:'优质',cost_optimized:'省钱',ensemble:'协同'}[strategy]}模式 · {activeModel} · Enter 发送 · / 命令</span><span>{web?'🌐 联网中':''}</span></div>
          </div>
        </div>
      </div>
    </div>
    {settingsOpen&&<SettingsPanel/>}{cmd&&<CmdPalette onClose={()=>setCmd(false)} onCommand={handleCmd}/>}
  </div>);
};

/* Markdown render */
function md(t:string):string{let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```mermaid\n([\s\S]*?)```/g,(_,c:string)=>'<div class="mdb">'+c.trim()+'</div>');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l:string,c:string)=>'<pre class="cb"><div class="cb-l">'+(l||'text')+'</div><code>'+hl(c.trim(),l)+'</code></pre>');h=h.replace(/`([^`]+)`/g,'<code>$1</code>');h=h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');h=h.replace(/\$\$(.+?)\$\$/g,(_,f:string)=>'<div class="lx">'+f+'</div>');h=h.replace(/\$(.+?)\$/g,(_,f:string)=>'<span class="li">'+f+'</span>');h=h.replace(/^### (.+)/gm,'<h3>$1</h3>');h=h.replace(/^## (.+)/gm,'<h2>$1</h2>');h=h.replace(/^# (.+)/gm,'<h1>$1</h1>');h=h.replace(/^[-*] (.+)/gm,'<li>$1</li>');h=h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');h=h.replace(/\n\n/g,'</p><p>');h=h.replace(/\n/g,'<br/>');return'<p>'+h+'</p>'}
function hl(c:string,l:string):string{const kw:Record<string,string[]>={js:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this'],py:['def','return','if','elif','else','for','while','class','import','from','async','await','try','except','raise','with','as','None','True','False'],ts:['const','let','var','function','return','if','else','for','while','class','export','import','async','await','try','catch','throw','new','this','interface','type','extends']};const w=kw[l]||[];let o=c;w.forEach(x=>{o=o.replace(new RegExp('\\b'+x+'\\b','g'),'<span class="hk">'+x+'</span>')});o=o.replace(/(\".*?\")/g,'<span class="hs">$1</span>');o=o.replace(/(\'.*?\')/g,'<span class="hs">$1</span>');o=o.replace(/(\/\/.*)/g,'<span class="hc">$1</span>');o=o.replace(/(\d+)/g,'<span class="hn">$1</span>');return o}
export default App;
