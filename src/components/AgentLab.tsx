import React, { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { t } from '../i18n';

/* ── Benchmark questions ───────────────────────────── */
const BENCHMARKS = [
  { id: 'knapsack', label: 'Knapsack', prompt: '背包容量50，3件物品：物品1价值60重量10，物品2价值100重量20，物品3价值120重量30。求最优选择。', groundTruth: '选物品2和3，总价值220' },
  { id: 'scheduling', label: 'Scheduling', prompt: '3个工件，处理时间分别为2、3、1。求最小化总完成时间的最优加工顺序。', groundTruth: 'SPT规则' },
  { id: 'assignment', label: 'Assignment', prompt: '3个工人分配到3个任务，成本矩阵：工人1: 9,2,7；工人2: 6,4,3；工人3: 5,8,1。求最小总成本。', groundTruth: '总成本=10' },
];

/* ═══════════════════════════════════════════════════════
   STANDALONE LAB — full-screen overlay, rich features
   ═══════════════════════════════════════════════════════ */
export function StandaloneLab({ onClose }: { onClose: () => void }) {
  const chat = useAppSelector(s => s.chat);
  const auth = useAppSelector(s => s.auth);
  const engine = chat.engineStatus;
  const lang = chat.settings.language;

  const [activeSection, setActiveSection] = useState('dashboard');
  const [diag, setDiag] = useState<any>(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResults, setBenchResults] = useState<any[]>([]);
  const [usageStats, setUsageStats] = useState({ calls: 0, tokens: 0, sessions: 0, lastReset: '' });
  const [sandboxHealth, setSandboxHealth] = useState<any>(null);
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [expHistory, setExpHistory] = useState<any[]>([]);
  const [execLog, setExecLog] = useState<any[]>([]);
  const [verifLog, setVerifLog] = useState<any[]>([]);
  const [flywheelStats, setFlywheelStats] = useState<Record<string,number>|null>(null);
  const [routerStats, setRouterStats] = useState<any[]>([]);
  const [skillEdges, setSkillEdges] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [activeAgent, setActiveAgent] = useState<any>(null);
  const [toolsList, setToolsList] = useState<any[]>([]);
  const [skillRegistry, setSkillRegistry] = useState<any>(null);
  const [debugState, setDebugState] = useState<any>(null);
  const [selectedProblemType, setSelectedProblemType] = useState('knapsack');

  const labLabels: any = {
    'zh-CN': { dashboard:'仪表盘', diagnostics:'自诊断', benchmark:'跑分台', experiments:'实验历史', sandbox:'沙箱', memory:'记忆库', agents:'多代理', tools:'工具库', training:'训练数据', desktop:'桌面助手', logs:'日志' },
    'en':     { dashboard:'Dashboard', diagnostics:'Diagnostics', benchmark:'Benchmark', experiments:'Experiments', sandbox:'Sandbox', memory:'Memory', agents:'Agents', tools:'Tools', training:'Training', desktop:'Desktop', logs:'Logs' },
    'ja':     { dashboard:'ダッシュボード', diagnostics:'診断', benchmark:'ベンチマーク', experiments:'実験履歴', sandbox:'サンドボックス', memory:'メモリ', agents:'エージェント', tools:'ツール', training:'訓練', desktop:'デスクトップ', logs:'ログ' },
    'fr':     { dashboard:'Tableau', diagnostics:'Diagnostic', benchmark:'Benchmark', experiments:'Experiences', sandbox:'Sandbox', memory:'Memoire', agents:'Agents', tools:'Outils', training:'Entrainement', desktop:'Bureau', logs:'Journaux' },
  };
  const labL = labLabels[lang] || labLabels['zh-CN'];
  const sections = [
    { id: 'dashboard',   label: labL.dashboard },
    { id: 'diagnostics', label: labL.diagnostics },
    { id: 'benchmark',   label: labL.benchmark },
    { id: 'experiments', label: labL.experiments },
    { id: 'sandbox',     label: labL.sandbox },
    { id: 'memory',      label: labL.memory },
    { id: 'agents',      label: labL.agents },
    { id: 'tools',       label: labL.tools },
    { id: 'training',    label: labL.training },
    { id: 'desktop',     label: labL.desktop },
    { id: 'logs',        label: labL.logs },
  ];

  useEffect(()=>{function h(e:KeyboardEvent){if(e.key==='Escape')onClose()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[onClose]);
  useEffect(() => {
    runDiagnostics();
    refreshSandbox();
    loadExperimentHistory();
    loadTrainingStats();
    loadAuditLog();
    loadAgents();
    loadTools();
    const dapi = window.electronAPI;
    if (dapi?.debugState) dapi.debugState().then((d: any) => setDebugState(d)).catch(() => {});
    setUsageStats({
      calls: auth.tokenUsageCount || 0,
      tokens: chat.contextTokens?.used || 0,
      sessions: chat.sessions.length,
      lastReset: new Date().toLocaleDateString(),
    });
  }, []);

  const runDiagnostics = () => {
    const api = window.electronAPI; if (!api) return;
    api.healthCheck().then((r: any) => { if (Array.isArray(r)) setDiag(r); }).catch(() => {});
  };

  const refreshSandbox = () => {
    const api = window.electronAPI; if (!api) return;
    api.sandboxHealth().then((h: any) => setSandboxHealth(h)).catch(() => {});
    api.sandboxPackages().then((p: any[]) => setPkgs(p || [])).catch(() => {});
  };

  const loadExperimentHistory = () => {
    const api = window.electronAPI; if (!api) return;
    api.toolsExecute?.({ tool: 'polaris_remember', params: { action: 'list' } })
      .then((r: any) => {
        try { setExpHistory(JSON.parse(r?.result || '[]')); } catch {}
      }).catch(() => {});
  };

  const loadTrainingStats = () => {
    const api = window.electronAPI; if (!api) return;
    api.flywheelStats?.().then((s: any) => setFlywheelStats(s)).catch(() => {});
    loadRouterStats('knapsack');
    api.skillgraphEdges?.(10).then((e: any) => setSkillEdges(e || [])).catch(() => {});
    api.skillsRegistry?.().then((s: any) => setSkills(s || [])).catch(() => {});
  };

  const loadAuditLog = () => {
    const api = window.electronAPI; if (!api) return;
    api.securityAuditLog?.().then((a: any) => setAuditLog(Array.isArray(a) ? a : [])).catch(() => {});
  };

  const loadAgents = () => {
    const api = window.electronAPI; if (!api) return;
    api.agentsList?.().then((a: any) => setAgents(Array.isArray(a) ? a : [])).catch(() => {});
  };

  const loadTools = () => {
    const api = window.electronAPI; if (!api) return;
    api.toolsList?.().then((t: any) => setToolsList(Array.isArray(t) ? t : [])).catch(() => {});
    api.skillRegistryList?.().then((r: any) => setSkillRegistry(r)).catch(() => {});
  };

  // 订阅 agent 切换事件（多 Agent 面板实时指示）
  useEffect(() => {
    const api = window.electronAPI; if (!api) return;
    api.onAgentSwitch?.((a: any) => setActiveAgent(a));
  }, []);

  const loadRouterStats = (problemType: string) => {
    const api = window.electronAPI; if (!api) return;
    api.routerStats?.(problemType).then((r: any) => setRouterStats(r || [])).catch(() => {});
  };

  /* ── Benchmark ── */
  const runBenchmark = async () => {
    const api = window.electronAPI; if (!api) return;
    setBenchRunning(true); const results: any[] = [];
    for (const b of BENCHMARKS) {
      const start = Date.now();
      try {
        const res = await api.query({ text: b.prompt, strategy: 'best_quality', apiKeys: {} });
        const elapsed = Date.now() - start;
        const content = res?.responses?.[0]?.content || '';
        const passed = content.includes(b.groundTruth.slice(0, 8));
        results.push({ id: b.id, label: b.label, elapsed: elapsed + 'ms', passed, content: content.slice(0, 300) });
      } catch (e: any) {
        results.push({ id: b.id, label: b.label, elapsed: 'FAIL', passed: false, content: e.message });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    setBenchResults(results); setBenchRunning(false);
  };

  return (
    <div className="fixed inset-0 z-[250] bg-background/90 backdrop-blur-sm flex animate-fade-in" onClick={onClose}>
      <div className="flex w-full h-full max-w-[1100px] mx-auto rounded-none border-r border-l border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ── Sidebar ── */}
        <div className="w-[190px] shrink-0 bg-muted/30 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-4 pt-5 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-mono">{t(lang, 'sidebar.lab')}</span>
            <button onClick={onClose} className="px-3 py-1 rounded-md bg-muted/50 hover:bg-muted text-xs text-muted-foreground hover:text-foreground font-mono transition-colors">Esc</button>
          </div>
          <div className="flex-1 px-2 py-1 space-y-0.5">
            {sections.map(sec => (
              <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                className={'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ' +
                  (activeSection === sec.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
                <span>{sec.label}</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-3 border-t border-border space-y-2">
            <p className="text-[9px] text-muted-foreground font-mono">Polaris Lab v4.0</p>
            <button onClick={onClose} className="w-full py-2 rounded-md bg-muted/50 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors">Close Lab</button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeSection === 'dashboard' && <DashboardSection lang={lang} usageStats={usageStats} engine={engine} chat={chat} diag={diag} debugState={debugState} />}
          {activeSection === 'diagnostics' && <DiagnosticsSection lang={lang} diag={diag} onRefresh={runDiagnostics} />}
          {activeSection === 'benchmark' && <BenchmarkSection lang={lang} benchResults={benchResults} benchRunning={benchRunning} onRun={runBenchmark} />}
          {activeSection === 'experiments' && <ExperimentsSection lang={lang} expHistory={expHistory} onRefresh={loadExperimentHistory} />}
          {activeSection === 'sandbox' && <SandboxSection lang={lang} health={sandboxHealth} pkgs={pkgs} onRefresh={refreshSandbox} />}
          {activeSection === 'memory' && <MemorySection lang={lang} memEntries={chat.settings.memory.entries} />}
          {activeSection === 'agents' && <AgentsSection lang={lang} agents={agents} activeAgent={activeAgent} />}
          {activeSection === 'tools' && <ToolsSection lang={lang} tools={toolsList} skillRegistry={skillRegistry} />}
          {activeSection === 'training' && <TrainingSection lang={lang} flywheelStats={flywheelStats} routerStats={routerStats} skillEdges={skillEdges} skills={skills} selectedProblemType={selectedProblemType} onSelectType={(t: string) => { setSelectedProblemType(t); loadRouterStats(t); }} onRefresh={loadTrainingStats} />}
          {activeSection === 'desktop' && <DesktopSection lang={lang} />}
          {activeSection === 'logs' && <LogsSection lang={lang} auditLog={auditLog} onRefresh={loadAuditLog} />}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard ── */
function DashboardSection({ lang, usageStats, engine, chat, diag, debugState }: any) {
  const passCount = (diag || []).filter((d: any) => d.ok).length;
  const totalCount = (diag || []).length;
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.dashboard')}</h3>
      <div className="grid grid-cols-4 gap-3">
        {[
          { v: usageStats.calls, l: t(lang,'lab.dashCalls'), c: 'text-blue-400' },
          { v: (usageStats.tokens / 1000).toFixed(1) + 'K', l: t(lang,'lab.dashTokens'), c: 'text-amber-400' },
          { v: usageStats.sessions, l: t(lang,'lab.dashSessions'), c: 'text-emerald-400' },
          { v: passCount + '/' + totalCount, l: t(lang,'lab.dashHealth'), c: passCount === totalCount ? 'text-emerald-400' : 'text-red-400' },
        ].map((item, i) => (
          <div key={i} className="p-4 rounded-xl bg-muted/20 border border-border/50">
            <div className={'text-2xl font-bold font-mono ' + item.c}>{item.v}</div>
            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{item.l}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { v: engine.python ? 'Online' : 'Offline', l: 'Python Engine', ok: engine.python },
          { v: engine.polaris ? 'Installed' : 'Missing', l: 'polaris-opt', ok: engine.polaris },
          { v: engine.highs ? 'Ready' : 'Missing', l: 'HiGHS Solver', ok: engine.highs },
          { v: engine.deepseek ? 'Connected' : 'Disconnected', l: 'DeepSeek API', ok: engine.deepseek },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/50">
            <div className={'w-2 h-2 rounded-full ' + (item.ok ? 'bg-emerald-500' : 'bg-red-500')} />
            <div>
              <div className="text-sm font-medium text-foreground">{item.v}</div>
              <div className="text-[10px] text-muted-foreground">{item.l}</div>
            </div>
          </div>
        ))}
      </div>
      {debugState && (
        <div className="rounded-xl bg-muted/20 border border-border/50 p-4 font-mono text-[10px] text-muted-foreground space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">{lang === 'zh-CN' ? '调试状态' : 'Debug State'}</div>
          <div>version: <span className="text-foreground">{debugState.version}</span> · electron {debugState.electron} · node {debugState.node}</div>
          <div>platform: <span className="text-foreground">{debugState.platform}/{debugState.arch}</span></div>
          <div>keyLoaded: <span className={debugState.keyLoaded ? 'text-emerald-500' : 'text-red-400'}>{String(debugState.keyLoaded)}</span> · localModel: <span className={debugState.localModelAvailable ? 'text-emerald-500' : 'text-muted-foreground'}>{String(debugState.localModelAvailable)}</span> · serve: <span className={debugState.serveRunning ? 'text-emerald-500' : 'text-muted-foreground'}>{String(debugState.serveRunning)}</span> · uptime {debugState.uptimeSec}s</div>
        </div>
      )}
    </div>
  );
}

/* ── Diagnostics ── */
function DiagnosticsSection({ lang, diag, onRefresh }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.diagTitle')}</h3>
        <Button size="sm" className="h-7 text-[10px]" onClick={onRefresh}>{t(lang,'lab.diagRefresh')}</Button>
      </div>
      {diag ? (
        <div className="grid grid-cols-1 gap-2">
          {diag.map((d: any, i: number) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-muted/20 border border-border/50">
              <div className={'w-3 h-3 rounded-full shrink-0 ' + (d.ok ? 'bg-emerald-500' : 'bg-red-500')} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{d.service}</div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">{d.ok ? (d.cmd || d.detail || 'OK') : (d.error || 'Error')}</div>
              </div>
              <span className={'text-[11px] font-mono font-semibold ' + (d.ok ? 'text-emerald-500' : 'text-red-500')}>{d.ok ? 'PASS' : 'FAIL'}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t(lang,'lab.diagClick')}</p>}
    </div>
  );
}

/* ── Benchmark ── */
function BenchmarkSection({ lang, benchResults, benchRunning, onRun }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.benchTitle')}</h3>
        <Button size="sm" className="h-7 text-[10px]" onClick={onRun} disabled={benchRunning}>{benchRunning ? t(lang,'lab.benchRunning') : t(lang,'lab.benchRun')}</Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">{t(lang,'lab.benchDesc')}</p>
      {benchResults.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="px-4 py-2.5 text-left font-medium">{BENCHMARKS[0] ? 'Problem' : t(lang,'lab.benchStatus')}</th>
              <th className="px-4 py-2.5 text-left font-medium">{t(lang,'lab.benchLatency')}</th>
              <th className="px-4 py-2.5 text-left font-medium">{t(lang,'lab.benchStatus')}</th>
              <th className="px-4 py-2.5 text-left font-medium">{t(lang,'lab.benchOutput')}</th>
            </tr></thead>
            <tbody>
              {benchResults.map((br: any, i: number) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-4 py-2.5 font-medium">{br.label}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{br.elapsed}</td>
                  <td className="px-4 py-2.5">{br.passed ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-red-500 font-bold">FAIL</span>}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[300px] truncate">{br.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Experiments ── */
function ExperimentsSection({ lang, expHistory, onRefresh }: any) {
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const zh = lang === 'zh-CN';
  const doAnalyze = async () => {
    if (expHistory.length === 0) return;
    setAnalyzing(true); setAnalysis('');
    const api = window.electronAPI; if (!api) { setAnalyzing(false); return; }
    const text = expHistory.map((e: any, i: number) => (zh ? '实验' : 'Exp') + (i + 1) + ': ' + (e.problem || '') + ' size=' + (e.sizes || '') + ' solvers=' + (e.solvers || '') + '\n' + (e.summary || '')).join('\n\n');
    try { const r = await api.resultAnalyze?.({ text, type: 'results' }); setAnalysis(r?.result || r?.error || (zh ? '分析失败' : 'Failed')); }
    catch (e: any) { setAnalysis(e.message); }
    setAnalyzing(false);
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.expTitle')}</h3>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-[10px]" onClick={doAnalyze} disabled={analyzing || expHistory.length === 0}>{analyzing ? (zh ? '分析中…' : 'Analyzing…') : (zh ? 'AI 分析' : 'AI Analyze')}</Button>
          <Button size="sm" className="h-7 text-[10px]" onClick={onRefresh}>{t(lang,'lab.expRefresh')}</Button>
        </div>
      </div>
      {analysis && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-xs text-foreground whitespace-pre-wrap leading-relaxed">{analysis}</div>
      )}
      {expHistory.length > 0 ? (
        <div className="space-y-2">
          {expHistory.map((e: any, i: number) => (
            <div key={i} className="p-4 rounded-xl bg-muted/20 border border-border/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-primary">{e.problem || e.id}</span>
                <span className="text-[10px] text-muted-foreground">{e.timestamp || ''}</span>
                {e.sizes && <span className="text-[10px] text-muted-foreground font-mono">size={e.sizes}</span>}
                {e.solvers && <span className="text-[10px] text-muted-foreground font-mono">solvers={e.solvers}</span>}
              </div>
              {e.summary && <p className="text-xs text-muted-foreground mt-1.5">{e.summary}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-3xl mb-3 text-muted-foreground/30">—</div>
          <p className="text-sm">{t(lang,'lab.expEmpty')}</p>
          <p className="text-xs mt-1 opacity-60">{t(lang,'lab.expEmptyDesc')}</p>
        </div>
      )}
    </div>
  );
}

/* ── Sandbox ── */
function SandboxSection({ lang, health, pkgs, onRefresh }: any) {
  const [pkgInput, setPkgInput] = useState('');
  const [installing, setInstalling] = useState(false);
  const [code, setCode] = useState('');
  const [codeOut, setCodeOut] = useState('');
  const [running, setRunning] = useState(false);
  const installPkg = () => {
    if (!pkgInput.trim()) return; const api = window.electronAPI; if (!api) return;
    setInstalling(true);
    api.sandboxInstallPackage(pkgInput.trim()).then(() => { setInstalling(false); setPkgInput(''); setTimeout(onRefresh, 2000); }).catch(() => setInstalling(false));
  };
  const runCode = () => {
    if (!code.trim()) return; const api = window.electronAPI; if (!api) return;
    const doRun = () => {
      setRunning(true); setCodeOut('');
      api.sandboxRunCode(code).then((r: any) => { setRunning(false); setCodeOut((r?.stdout || r?.result || r?.error || '') + (r?.stderr ? '\n[stderr] ' + r.stderr : '')); }).catch((e: any) => { setRunning(false); setCodeOut(e.message); });
    };
    // 安全检查：危险操作需确认
    if (api.sandboxCheckSafety) {
      api.sandboxCheckSafety(code).then((risks: any[]) => {
        if (risks && risks.length > 0) {
          const labels = risks.map((r: any) => r.label).join('、');
          if (confirm((lang === 'zh-CN' ? '代码含风险操作（' : 'Code contains risky ops (') + labels + ')，' + (lang === 'zh-CN' ? '确认执行？' : 'confirm?'))) doRun();
        } else doRun();
      }).catch(() => doRun());
    } else doRun();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.sandTitle')}</h3>
        <Button size="sm" className="h-7 text-[10px]" onClick={onRefresh}>{t(lang,'lab.sandRefresh')}</Button>
      </div>
      {health && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Python Version</div>
            <div className="text-lg font-mono font-bold text-foreground mt-1">{health.pythonVersion || 'N/A'}</div>
            <div className={'text-[10px] mt-0.5 ' + (health.ready ? 'text-emerald-500' : 'text-red-500')}>{health.ready ? 'Ready' : 'Not installed'}</div>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">polaris-opt</div>
            <div className="text-lg font-mono font-bold text-foreground mt-1">{health.polarisReady ? 'Installed' : 'Missing'}</div>
            <div className={'text-[10px] mt-0.5 ' + (health.polarisReady ? 'text-emerald-500' : 'text-red-500')}>{health.polarisReady ? 'Editable mode' : 'Not installled'}</div>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Input placeholder={t(lang,'lab.sandPkg')} value={pkgInput} onChange={e => setPkgInput(e.target.value)} className="h-9 text-sm flex-1" />
        <Button size="sm" className="h-9 text-xs" onClick={installPkg} disabled={installing}>{installing ? t(lang,'lab.sandInstalling') : t(lang,'lab.sandInstall')}</Button>
      </div>
      {pkgs.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50"><tr><th className="px-4 py-2 text-left font-medium">Package</th><th className="px-4 py-2 text-left font-medium">Version</th></tr></thead>
            <tbody>{pkgs.map((p: any, i: number) => (
              <tr key={i} className="border-t border-border/50"><td className="px-4 py-2 font-mono">{p.name}</td><td className="px-4 py-2 font-mono text-muted-foreground">{p.version}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* ── 沙箱跑代码 ── */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">{lang === 'zh-CN' ? '沙箱代码执行' : 'Run Code in Sandbox'}</h4>
        <textarea value={code} onChange={e => setCode(e.target.value)} placeholder={lang === 'zh-CN' ? 'print("hello from sandbox")' : 'print("hello from sandbox")'} className="w-full h-24 rounded-lg border border-border bg-muted p-3 text-xs font-mono outline-none focus:ring-2 focus:ring-ring resize-y" />
        <div className="flex gap-2 mt-2">
          <Button size="sm" className="h-7 text-[10px]" onClick={runCode} disabled={running}>{running ? (lang === 'zh-CN' ? '运行中…' : 'Running…') : (lang === 'zh-CN' ? '运行' : 'Run')}</Button>
        </div>
        {codeOut && <pre className="mt-2 rounded-xl bg-black/40 border border-border/50 p-3 text-[10px] font-mono text-muted-foreground overflow-auto max-h-[200px] whitespace-pre-wrap">{codeOut}</pre>}
      </div>
    </div>
  );
}

/* ── Memory ── */
function MemorySection({ lang, memEntries }: any) {
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<any[]>(memEntries || []);
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.memTitle')}</h3>
      <p className="text-xs text-muted-foreground -mt-4">{t(lang,'lab.memDesc')}</p>
      <div className="flex gap-2">
        <Input placeholder={t(lang,'lab.memPlaceholder')} value={input} onChange={e => setInput(e.target.value)} className="h-9 text-sm flex-1" />
        <Button size="sm" className="h-9 text-xs" onClick={() => { if (input.trim()) { setEntries((p: any) => [...p, { key: 'manual', value: input, timestamp: Date.now() }]); setInput(''); } }}>{t(lang,'lab.memAdd')}</Button>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-1">
          {entries.slice().reverse().map((m, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 text-xs text-muted-foreground">
              <span className="flex-1 truncate">{m.value}</span>
              <span className="text-[9px] font-mono opacity-50">{new Date(m.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">{t(lang,'lab.memEmpty')}</div>
      )}
    </div>
  );
}

/* ── Agents (multi-agent system) ── */
function AgentsSection({ lang, agents, activeAgent }: any) {
  const zh = lang === 'zh-CN';
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-foreground">{zh ? '多代理系统' : 'Agent System'}</h3>
      <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
        <div className={'w-3 h-3 rounded-full ' + (activeAgent ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30')} />
        <div className="flex-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{zh ? '当前活跃' : 'Active'}</span>
          <span className="text-sm font-semibold text-foreground ml-2">{activeAgent ? activeAgent.name : '—'}</span>
          {activeAgent && <span className="text-[10px] text-muted-foreground font-mono ml-2">{activeAgent.role}</span>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {agents.map((a: any, i: number) => (
          <div key={i} className={'p-4 rounded-xl border ' + (activeAgent && activeAgent.id === a.id ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-muted/20')}>
            <div className="flex items-center gap-2">
              <div className={'w-2 h-2 rounded-full ' + (activeAgent && activeAgent.id === a.id ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
              <span className="text-sm font-semibold text-foreground">{a.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{a.id}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{a.role}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{a.goal}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {a.handoffs && a.handoffs.length > 0 && <span className="text-[9px] font-mono text-amber-400">handoffs: {a.handoffs.join(', ')}</span>}
              <span className="text-[9px] font-mono text-blue-400">{a.tools?.length || 0} tools</span>
              <span className="text-[9px] font-mono text-muted-foreground">T={a.temperature}</span>
            </div>
          </div>
        ))}
      </div>
      {agents.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{zh ? '暂无代理数据' : 'No agents'}</p>}
    </div>
  );
}

/* ── Tools + Skill Registry ── */
function ToolsSection({ lang, tools, skillRegistry }: any) {
  const zh = lang === 'zh-CN';
  const cats = skillRegistry?.categories || {};
  const skills = skillRegistry?.skills || [];
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-bold text-foreground">{zh ? '工具注册表' : 'Tool Registry'}</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-3">{tools.length} {zh ? '个工具' : 'tools'}</p>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((t: any, i: number) => (
            <div key={i} className="p-3 rounded-xl bg-muted/20 border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{t.name}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{t.id}</span>
                {t.requires_confirm && <span className="ml-auto text-[9px] font-mono text-amber-400">{zh ? '确认' : 'confirm'}</span>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{t.description}</p>
              <span className="text-[9px] font-mono text-blue-400">{t.category}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-bold text-foreground">{zh ? '技能注册表（工作流规划）' : 'Skill Registry (workflow)'}</h3>
        {Object.keys(cats).length > 0 && (
          <div className="flex gap-2 mt-2 mb-3 flex-wrap">
            {Object.keys(cats).map((k: string) => (
              <span key={k} className="px-2 py-0.5 rounded-full text-[9px] font-mono" style={{ color: cats[k].color, background: cats[k].color + '18' }}>{cats[k].icon} {cats[k].label}</span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {skills.map((s: any, i: number) => (
            <div key={i} className="p-3 rounded-xl bg-muted/20 border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{s.name}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{s.id}</span>
                {s.requiresConfirm && <span className="ml-auto text-[9px] font-mono text-amber-400">{zh ? '确认' : 'confirm'}</span>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{s.description}</p>
              <div className="flex gap-2 mt-1.5 text-[9px] font-mono text-muted-foreground">
                <span className="text-blue-400">in: {s.inputs.join(', ') || '—'}</span>
                <span className="text-emerald-400">out: {s.outputs.join(', ') || '—'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Desktop (computer-use lite) ── */
function DesktopSection({ lang }: any) {
  const [shot, setShot] = useState('');
  const [windows, setWindows] = useState<any[]>([]);
  const [info, setInfo] = useState<any>(null);
  const [clip, setClip] = useState('');
  const [path, setPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [taskGoal, setTaskGoal] = useState('');
  const [taskRunning, setTaskRunning] = useState(false);
  const [taskLog, setTaskLog] = useState<any[]>([]);
  const [taskShot, setTaskShot] = useState('');
  const chatSettings = useAppSelector((st: any) => st.chat.settings);
  const zh = lang === 'zh-CN';
  const api = () => (window as any).electronAPI;

  const doScreenshot = async () => { const a = api(); if (!a) return; setShot((await a.desktopScreenshot?.()) || ''); };
  const doListWindows = async () => { const a = api(); if (!a) return; setWindows((await a.desktopListWindows?.()) || []); };
  const doSystemInfo = async () => { const a = api(); if (!a) return; setInfo(await a.desktopSystemInfo?.()); };
  const doClipboard = async () => { const a = api(); if (!a) return; setClip((await a.desktopGetClipboard?.()) || ''); };
  const doReadFile = async () => { const a = api(); if (!a || !path) return; setFileContent((await a.desktopReadFile?.(path)) || '(空或读取失败)'); };
  const doOpenApp = async () => { const a = api(); if (!a) return; const p = prompt('应用路径或名称？'); if (p) a.desktopOpenApp?.(p); };
  const doRun = async () => { const a = api(); if (!a) return; const c = prompt(zh ? '要执行的命令？' : 'Command to run?'); if (c && confirm(zh ? '确认执行该命令？' : 'Confirm running this command?')) { const r = await a.desktopRunCommand?.(c); setClip(typeof r === 'string' ? r : JSON.stringify(r)); } };

  const runTask = async () => {
    if (!taskGoal.trim() || taskRunning) return;
    const a = api(); if (!a) return;
    setTaskRunning(true); setTaskLog([]);
    const vk = chatSettings?.apiKeys?.doubao || '';
    const history: any[] = [];
    for (let i = 0; i < 8; i++) {
      try {
        const r = await a.desktopVisionStep?.({ goal: taskGoal.trim(), history, visionKey: vk });
        if (r?.error) { setTaskLog(p => [...p, { action: 'error', result: (zh ? '视觉模型错误：' : 'Vision error: ') + r.error }]); break; }
        if (r?.screenshot) setTaskShot(r.screenshot); // 每步显示当前屏幕
        const action = r?.action || { action: 'done', summary: 'no action' };
        if (action.action === 'done') { setTaskLog(p => [...p, { action: 'done', result: action.summary || '完成' }]); break; }
        let result = 'OK';
        switch (action.action) {
          case 'click': if (action.x != null && action.y != null) { await a.desktopClickMouse?.(action.x, action.y); result = '点击 (' + action.x + ',' + action.y + ')'; } else result = '缺少坐标'; break;
          case 'double_click': if (action.x != null && action.y != null) { await a.desktopDoubleClick?.(action.x, action.y); result = '双击 (' + action.x + ',' + action.y + ')'; } else result = '缺少坐标'; break;
          case 'type': if (action.text) { await a.desktopTypeText?.(action.text); result = '输入 ' + action.text; } else result = '缺少 text'; break;
          case 'hotkey': if (action.combo) { await a.desktopHotkey?.(action.combo); result = '快捷键 ' + action.combo; } else result = '缺少 combo'; break;
          case 'scroll': await a.desktopScrollMouse?.(action.direction || 'down', action.amount || 3); result = '滚动 ' + (action.direction || 'down'); break;
          case 'open_browser': if (action.url) { await a.desktopOpenBrowser?.(action.url); result = '打开浏览器 ' + action.url; } else result = '缺少 url'; break;
          case 'open_app': if (action.app) { await a.desktopOpenApp?.(action.app); result = '打开应用 ' + action.app; } else result = '缺少 app'; break;
          case 'run_command': if (action.command && confirm(zh ? '执行命令：' : 'Run: ' + action.command + '?')) { await a.desktopRunCommand?.(action.command); result = '执行 ' + action.command; } else result = '命令已取消'; break;
          default: result = '未知动作: ' + action.action; break;
        }
        history.push({ action: action.action, result });
        setTaskLog(p => [...p, { action: action.action, result }]);
        await new Promise(res => setTimeout(res, 400)); // 动作后稍等，让 UI 稳定
      } catch (e: any) { setTaskLog(p => [...p, { action: 'error', result: e.message }]); break; }
    }
    setTaskRunning(false);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-foreground">{zh ? '桌面助手' : 'Desktop Assistant'}</h3>
      <p className="text-xs text-muted-foreground -mt-4">{zh ? '让 Polaris 观察并辅助操作你的电脑（危险操作需确认）' : 'Let Polaris observe and assist (dangerous ops require confirm)'}</p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="h-7 text-[10px]" onClick={doScreenshot}>📷 {zh ? '截图' : 'Shot'}</Button>
        <Button size="sm" className="h-7 text-[10px]" onClick={doListWindows}>🪟 {zh ? '列窗口' : 'Windows'}</Button>
        <Button size="sm" className="h-7 text-[10px]" onClick={doSystemInfo}>💻 {zh ? '系统' : 'System'}</Button>
        <Button size="sm" className="h-7 text-[10px]" onClick={doClipboard}>📋 {zh ? '剪贴板' : 'Clipboard'}</Button>
        <Button size="sm" className="h-7 text-[10px]" onClick={() => { if (confirm(zh ? '打开默认浏览器？' : 'Open browser?')) api()?.desktopOpenBrowser?.('https://bitwool.cn'); }}>🌐 {zh ? '浏览器' : 'Browser'}</Button>
        <Button size="sm" className="h-7 text-[10px]" onClick={doOpenApp}>🚀 {zh ? '开应用' : 'App'}</Button>
        <Button size="sm" className="h-7 text-[10px]" onClick={doRun}>⌨️ {zh ? '跑命令' : 'Cmd'}</Button>
      </div>
      {shot && <img src={shot} alt="screenshot" className="w-full rounded-xl border border-border" />}
      {windows.length > 0 && (
        <div className="space-y-1">
          {windows.slice(0, 12).map((w: any, i: number) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 text-xs font-mono text-muted-foreground">
              <span className="flex-1 truncate">{typeof w === 'string' ? w : (w.title || w.name || '')}</span>
            </div>
          ))}
        </div>
      )}
      {info && <pre className="rounded-xl bg-muted/20 border border-border/50 p-3 text-[10px] font-mono text-muted-foreground overflow-auto max-h-[200px]">{typeof info === 'string' ? info : JSON.stringify(info, null, 2)}</pre>}
      {clip && <div className="rounded-xl bg-muted/20 border border-border/50 p-3 text-xs font-mono text-muted-foreground max-h-[120px] overflow-auto whitespace-pre-wrap">{clip.slice(0, 2000)}</div>}
      <div className="flex gap-2">
        <Input placeholder={zh ? '文件路径（绝对路径）' : 'File path (absolute)'} value={path} onChange={e => setPath(e.target.value)} className="h-8 text-xs flex-1" />
        <Button size="sm" className="h-8 text-xs" onClick={doReadFile}>{zh ? '读文件' : 'Read'}</Button>
      </div>
      {fileContent && <pre className="rounded-xl bg-muted/20 border border-border/50 p-3 text-[10px] font-mono text-muted-foreground overflow-auto max-h-[240px] whitespace-pre-wrap">{fileContent.slice(0, 4000)}</pre>}

      {/* ── 桌面任务代理（视觉） ── */}
      <div className="pt-4 border-t border-border/50">
        <h4 className="text-sm font-semibold text-foreground mb-2">{zh ? '桌面任务代理（视觉）' : 'Desktop Task Agent (Vision)'}</h4>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-3">{zh ? '输入目标，Polaris 截图→豆包看图→决策→执行，自动循环（最多 8 步，危险操作会确认）' : 'Goal → screenshot → vision model → act, auto-loop (max 8 steps, dangerous ops confirm)'}</p>
        <div className="flex gap-2 mb-2">
          <Input placeholder={zh ? '例如：打开浏览器访问 GitHub' : 'e.g. Open browser to github.com'} value={taskGoal} onChange={e => setTaskGoal(e.target.value)} className="h-8 text-xs flex-1" />
          <Button size="sm" className="h-8 text-xs" onClick={runTask} disabled={taskRunning}>{taskRunning ? (zh ? '执行中…' : 'Running…') : (zh ? '执行' : 'Run')}</Button>
        </div>
        {taskShot && taskRunning && <img src={taskShot} alt="screen" className="w-full rounded-xl border border-border mb-2" />}
        {taskLog.length > 0 && (
          <div className="rounded-xl bg-black/40 border border-border/50 p-3 font-mono text-[10px] text-muted-foreground space-y-0.5 max-h-[180px] overflow-y-auto">
            {taskLog.map((l, i) => (
              <div key={i} className={l.action === 'error' ? 'text-red-400' : l.action === 'done' ? 'text-emerald-400' : ''}>{l.action}: {l.result}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Skill Graph (SVG visualization) ── */
function SkillGraphView({ edges, skills, emptyText }: any) {
  var nodeSet = new Set<string>();
  (edges || []).forEach(function(e: any) { if (e.from) nodeSet.add(e.from); if (e.to) nodeSet.add(e.to); });
  if (nodeSet.size === 0) { (skills || []).forEach(function(s: any) { nodeSet.add(s.name); }); }
  var nodeArr = Array.from(nodeSet);
  var n = nodeArr.length;
  if (n === 0) return <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>;

  var W = 560, H = 300, cx = W / 2, cy = H / 2 - 8;
  var R = Math.min(120, Math.max(70, n * 20));
  var pos: Record<string, { x: number; y: number }> = {};
  nodeArr.forEach(function(name, i) {
    var angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    pos[name] = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  var maxCount = 1;
  (edges || []).forEach(function(e: any) { if (e.count > maxCount) maxCount = e.count; });

  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full h-auto rounded-xl border border-border/50 bg-muted/10">
      {(edges || []).map(function(e: any, i: number) {
        var a = pos[e.from], b = pos[e.to];
        if (!a || !b) return null;
        var w = Math.max(1, (e.count / maxCount) * 4);
        return <line key={'e' + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c8a96e" strokeWidth={w} opacity={0.55} />;
      })}
      {nodeArr.map(function(name, i) {
        var p = pos[name];
        var short = name.length > 10 ? name.slice(0, 9) + '…' : name;
        return (
          <g key={'n' + i}>
            <circle cx={p.x} cy={p.y} r={15} fill="#0d0d12" stroke="#c8a96e" strokeWidth={1.5} />
            <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={6.5} fill="#e8e6e1" fontFamily="monospace">{short}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Training ── */
const PROBLEM_TYPES = ['knapsack','scheduling','assignment','facility','vrp','multi_knapsack','set_covering','custom'];
function TrainingSection({ lang, flywheelStats, routerStats, skillEdges, skills, selectedProblemType, onSelectType, onRefresh }: any) {
  const labels: any = {
    'zh-CN': { title:'训练数据看板', desc:'每次求解自动积累训练样本，用于DPO微调小模型', dpoPairs:'DPO偏好对', verifLabels:'验证标签', routeRecs:'路由记录', hallucSamples:'幻觉样本', routerTitle:'模型路由表现', routerDesc:'各模型在不同问题类型上的成功率', edgesTitle:'技能编排图', edgesDesc:'高频技能转换（越常用越靠前）', registryTitle:'技能注册表', registryDesc:'已注册的 Agent 技能与能力', noData:'暂无数据 — 运行一次求解后自动产生', refresh:'刷新', total:'总计' },
    'en':     { title:'Training Dashboard', desc:'Each solve auto-produces labeled samples for DPO fine-tuning', dpoPairs:'DPO Pairs', verifLabels:'Verif. Labels', routeRecs:'Route Records', hallucSamples:'Hallucination', routerTitle:'Model Router Performance', routerDesc:'Success rates per problem type', edgesTitle:'Skill Graph', edgesDesc:'Frequent skill transitions', registryTitle:'Skill Registry', registryDesc:'Registered agent skills and capabilities', noData:'No data yet — run a solve to start accumulating', refresh:'Refresh', total:'Total' },
    'ja':     { title:'訓練データ', desc:'各求解が自動的にDPO微調整用サンプルを生成します', dpoPairs:'DPOペア', verifLabels:'検証ラベル', routeRecs:'ルート記録', hallucSamples:'幻覚', routerTitle:'ルーター性能', routerDesc:'問題タイプ別成功率', edgesTitle:'スキルグラフ', edgesDesc:'頻繁なスキル遷移', registryTitle:'スキルレジストリ', registryDesc:'登録済みスキル一覧', noData:'データなし — 求解を実行してください', refresh:'更新', total:'合計' },
    'fr':     { title:'Tableau entraînement', desc:'Chaque résolution produit des échantillons étiquetés', dpoPairs:'Paires DPO', verifLabels:'Étiquettes', routeRecs:'Routage', hallucSamples:'Hallucination', routerTitle:'Performance routeur', routerDesc:'Taux de réussite par type', edgesTitle:'Graphe compétences', edgesDesc:'Transitions fréquentes', registryTitle:'Registre compétences', registryDesc:'Compétences enregistrées', noData:'Pas de données — lancez une résolution', refresh:'Actualiser', total:'Total' },
  };
  const L = labels[lang] || labels['zh-CN'];
  const statCards = [
    { key: 'dpo_preference_pairs.jsonl', label: L.dpoPairs, color: 'text-amber-400' },
    { key: 'verification_labels.jsonl', label: L.verifLabels, color: 'text-emerald-400' },
    { key: 'routing_performance.jsonl', label: L.routeRecs, color: 'text-blue-400' },
    { key: 'hallucination_samples.jsonl', label: L.hallucSamples, color: 'text-red-400' },
  ];
  const total = flywheelStats ? Object.values(flywheelStats).reduce((a: number,b: number) => a+b, 0) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{L.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{L.desc}</p>
        </div>
        <Button size="sm" className="h-7 text-[10px]" onClick={onRefresh}>{L.refresh}</Button>
      </div>

      {/* ── Flywheel stats ── */}
      {flywheelStats ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            {statCards.map((sc, i) => (
              <div key={i} className="p-4 rounded-xl bg-muted/20 border border-border/50">
                <div className={'text-2xl font-bold font-mono ' + sc.color}>{flywheelStats[sc.key] || 0}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{sc.label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{L.total}: {total}</span>
            <span>records</span>
            <button onClick={() => { const api = window.electronAPI; if (api) api.flywheelExport?.('jsonl').then((r: any) => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'flywheel-export.json'; a.click(); }).catch(() => {}); }} className="ml-auto text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors">{L.export || '导出'}</button>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-border/50">
          <div className="text-3xl mb-3 text-muted-foreground/30">—</div>
          <p className="text-sm">{L.noData}</p>
        </div>
      )}

      {/* ── Router performance ── */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">{L.routerTitle}</h4>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-3">{L.routerDesc}</p>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {PROBLEM_TYPES.map(pt => (
            <button key={pt} onClick={() => onSelectType(pt)}
              className={'px-2.5 py-1 rounded-md text-[10px] font-mono transition-all ' +
                (selectedProblemType === pt ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {pt}
            </button>
          ))}
        </div>
        {routerStats.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Model</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Success</th>
                  <th className="px-4 py-2 text-right font-medium">Halluc.</th>
                  <th className="px-4 py-2 text-right font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {routerStats.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-4 py-2 font-mono font-medium">{r.model}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.total}</td>
                    <td className="px-4 py-2 text-right font-mono" style={{color: r.successRate !== null ? (r.successRate >= 80 ? '#4ade80' : r.successRate >= 50 ? '#facc15' : '#f87171') : '#888'}}>{r.successRate !== null ? r.successRate + '%' : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono" style={{color: r.hallucRate !== null ? (r.hallucRate === 0 ? '#4ade80' : '#f87171') : '#888'}}>{r.hallucRate !== null ? r.hallucRate + '%' : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{r.avgGap != null ? r.avgGap.toFixed(3) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">{L.noData}</p>
        )}
      </div>

      {/* ── 技能注册表 ── */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">{L.registryTitle}</h4>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-3">{L.registryDesc}</p>
        {skills.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {skills.map((sk: any, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-muted/20 border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{sk.name}</span>
                  <span className="text-[9px] font-mono text-muted-foreground">{sk.id}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{sk.description}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[9px] font-mono text-blue-400">{sk.tools.length} tools</span>
                  <span className="text-[9px] font-mono text-amber-400">T={sk.temperature}</span>
                  <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[200px]">{sk.tools.slice(0, 3).join(', ')}{sk.tools.length > 3 ? '…' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">{L.noData}</p>
        )}
      </div>

      {/* ── Skill graph (SVG) ── */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">{L.edgesTitle}</h4>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-3">{L.edgesDesc}</p>
        <SkillGraphView edges={skillEdges} skills={skills} emptyText={L.noData} />
      </div>

      {/* ── 技能图检索 + 训练操作台 ── */}
      <SkillSearch lang={lang} />
      <TrainingOps lang={lang} />
    </div>
  );
}

/* ── Skill graph similarity search (BARRIER 5) ── */
function SkillSearch({ lang }: any) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const zh = lang === 'zh-CN';
  const doSearch = async () => {
    if (!q.trim()) return;
    setLoading(true);
    const api = window.electronAPI; if (!api) { setLoading(false); return; }
    try { setResults((await api.skillgraphSimilar?.(q.trim(), 5)) || []); } catch { setResults([]); }
    setLoading(false);
  };
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-2">{zh ? '相似工作流检索' : 'Similar Workflow Search'}</h4>
      <div className="flex gap-2 mb-3">
        <Input placeholder={zh ? '描述目标，检索可复用的工作流…' : 'Describe a goal to find reusable workflows…'} value={q} onChange={e => setQ(e.target.value)} className="h-8 text-xs flex-1" />
        <Button size="sm" className="h-8 text-xs" onClick={doSearch} disabled={loading}>{loading ? '…' : (zh ? '检索' : 'Search')}</Button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r: any, i: number) => (
            <div key={i} className="px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
              <div className="text-xs text-foreground">{r.goal}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">
                <span className="text-amber-400">{r.similarity}</span> · {(r.skillChain || []).map((s: any) => s.skill).join(' → ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Training console (触发内部训练脚本) ── */
function TrainingOps({ lang }: any) {
  const [scripts, setScripts] = useState<any[]>([]);
  const [logs, setLogs] = useState<{ id: string; type: string; line: string }[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const zh = lang === 'zh-CN';

  useEffect(() => {
    const api = window.electronAPI; if (!api) return;
    api.trainingList?.().then((s: any) => setScripts(s || [])).catch(() => {});
    api.onTrainingLog?.((d: any) => {
      setLogs(p => [...p.slice(-300), { id: d.id, type: d.type, line: d.line }]);
      if (d.type === 'exit') setRunning(null);
    });
  }, []);

  const run = async (id: string) => {
    const api = window.electronAPI; if (!api) return;
    setRunning(id); setLogs([]);
    const r = await api.trainingRun?.(id);
    if (r && !r.success) { setRunning(null); setLogs([{ id, type: 'err', line: r.error }]); }
  };

  const labels: any = {
    'zh-CN': { title:'训练操作台', desc:'触发数据生成 / 蒸馏 / 训练 / 分片上传（内部脚本，长任务）', run:'运行', running:'运行中…', unavailable:'脚本不存在（仅 dev 模式）', log:'实时日志', clear:'清空' },
    'en': { title:'Training Console', desc:'Trigger data generation / distillation / training / upload (internal scripts)', run:'Run', running:'Running…', unavailable:'Script missing (dev mode only)', log:'Logs', clear:'Clear' },
  };
  const L = labels[lang] || labels['zh-CN'];

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-2">{L.title}</h4>
      <p className="text-[10px] text-muted-foreground -mt-1 mb-3">{L.desc}</p>
      <div className="space-y-1.5 mb-3">
        {scripts.map((s: any, i: number) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-foreground">{s.script}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{s.kind}</span>
                {!s.available && <span className="text-[9px] font-mono text-red-400">{L.unavailable}</span>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</p>
            </div>
            <Button size="sm" className="h-7 text-[10px]" disabled={!s.available || running === s.id} onClick={() => run(s.id)}>
              {running === s.id ? L.running : L.run}
            </Button>
          </div>
        ))}
      </div>
      {logs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <h5 className="text-[10px] font-semibold text-muted-foreground">{L.log}</h5>
            <button onClick={() => setLogs([])} className="text-[9px] font-mono text-muted-foreground hover:text-foreground">{L.clear}</button>
          </div>
          <div className="rounded-xl bg-black/40 border border-border/50 p-3 font-mono text-[10px] text-muted-foreground space-y-0.5 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
            {logs.map((l, i) => (
              <div key={i} className={l.type === 'err' ? 'text-red-400' : l.type === 'exit' ? 'text-amber-400' : 'text-muted-foreground'}>{l.line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Logs (real audit log from security.js) ── */
function LogsSection({ lang, auditLog, onRefresh }: any) {
  const title = lang === 'zh-CN' ? '审计日志' : 'Audit Log';
  const empty = lang === 'zh-CN' ? '暂无审计记录 — 登录或执行文件操作后自动产生' : 'No audit entries yet';
  const refresh = lang === 'zh-CN' ? '刷新' : 'Refresh';
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <Button size="sm" className="h-7 text-[10px]" onClick={onRefresh}>{refresh}</Button>
      </div>
      {auditLog && auditLog.length > 0 ? (
        <div className="rounded-xl bg-muted/20 border border-border/50 p-4 font-mono text-xs text-muted-foreground space-y-0.5 max-h-[500px] overflow-y-auto">
          {auditLog.slice().reverse().map((l: any, i: number) => (
            <div key={i} className="hover:text-foreground transition-colors">
              <span className="text-muted-foreground/50">[{l.ts ? new Date(l.ts).toLocaleTimeString() : '--:--:--'}]</span>{' '}
              <span className="text-amber-400">[{l.category}/{l.action}]</span>{' '}
              <span>{l.detail}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-border/50">
          <p className="text-sm">{empty}</p>
        </div>
      )}
    </div>
  );
}

/* Re-export old AgentLab for backward compat (Settings sub-tab, kept but mostly unused now) */
export const AgentLab: React.FC = () => {
  return <StandaloneLab onClose={() => {}} />;
};
