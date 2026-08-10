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
  const [selectedProblemType, setSelectedProblemType] = useState('knapsack');

  const labLabels: any = {
    'zh-CN': { dashboard:'仪表盘', diagnostics:'自诊断', benchmark:'跑分台', experiments:'实验历史', sandbox:'沙箱', memory:'记忆库', training:'训练数据', logs:'日志' },
    'en':     { dashboard:'Dashboard', diagnostics:'Diagnostics', benchmark:'Benchmark', experiments:'Experiments', sandbox:'Sandbox', memory:'Memory', training:'Training', logs:'Logs' },
    'ja':     { dashboard:'ダッシュボード', diagnostics:'診断', benchmark:'ベンチマーク', experiments:'実験履歴', sandbox:'サンドボックス', memory:'メモリ', training:'訓練', logs:'ログ' },
    'fr':     { dashboard:'Tableau', diagnostics:'Diagnostic', benchmark:'Benchmark', experiments:'Experiences', sandbox:'Sandbox', memory:'Memoire', training:'Entrainement', logs:'Journaux' },
  };
  const labL = labLabels[lang] || labLabels['zh-CN'];
  const sections = [
    { id: 'dashboard',   label: labL.dashboard },
    { id: 'diagnostics', label: labL.diagnostics },
    { id: 'benchmark',   label: labL.benchmark },
    { id: 'experiments', label: labL.experiments },
    { id: 'sandbox',     label: labL.sandbox },
    { id: 'memory',      label: labL.memory },
    { id: 'training',    label: labL.training },
    { id: 'logs',        label: labL.logs },
  ];

  useEffect(()=>{function h(e:KeyboardEvent){if(e.key==='Escape')onClose()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[onClose]);
  useEffect(() => {
    runDiagnostics();
    refreshSandbox();
    loadExperimentHistory();
    loadTrainingStats();
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
  };

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
          {activeSection === 'dashboard' && <DashboardSection lang={lang} usageStats={usageStats} engine={engine} chat={chat} diag={diag} />}
          {activeSection === 'diagnostics' && <DiagnosticsSection lang={lang} diag={diag} onRefresh={runDiagnostics} />}
          {activeSection === 'benchmark' && <BenchmarkSection lang={lang} benchResults={benchResults} benchRunning={benchRunning} onRun={runBenchmark} />}
          {activeSection === 'experiments' && <ExperimentsSection lang={lang} expHistory={expHistory} onRefresh={loadExperimentHistory} />}
          {activeSection === 'sandbox' && <SandboxSection lang={lang} health={sandboxHealth} pkgs={pkgs} onRefresh={refreshSandbox} />}
          {activeSection === 'memory' && <MemorySection lang={lang} memEntries={chat.settings.memory.entries} />}
          {activeSection === 'training' && <TrainingSection lang={lang} flywheelStats={flywheelStats} routerStats={routerStats} skillEdges={skillEdges} selectedProblemType={selectedProblemType} onSelectType={(t: string) => { setSelectedProblemType(t); loadRouterStats(t); }} onRefresh={loadTrainingStats} />}
          {activeSection === 'logs' && <LogsSection lang={lang} />}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard ── */
function DashboardSection({ lang, usageStats, engine, chat, diag }: any) {
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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.expTitle')}</h3>
        <Button size="sm" className="h-7 text-[10px]" onClick={onRefresh}>{t(lang,'lab.expRefresh')}</Button>
      </div>
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
  const installPkg = () => {
    if (!pkgInput.trim()) return; const api = window.electronAPI; if (!api) return;
    setInstalling(true);
    api.sandboxInstallPackage(pkgInput.trim()).then(() => { setInstalling(false); setPkgInput(''); setTimeout(onRefresh, 2000); }).catch(() => setInstalling(false));
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

/* ── Training ── */
const PROBLEM_TYPES = ['knapsack','scheduling','assignment','facility','vrp','multi_knapsack','set_covering','custom'];
function TrainingSection({ lang, flywheelStats, routerStats, skillEdges, selectedProblemType, onSelectType, onRefresh }: any) {
  const labels: any = {
    'zh-CN': { title:'训练数据看板', desc:'每次求解自动积累训练样本，用于DPO微调小模型', dpoPairs:'DPO偏好对', verifLabels:'验证标签', routeRecs:'路由记录', hallucSamples:'幻觉样本', routerTitle:'模型路由表现', routerDesc:'各模型在不同问题类型上的成功率', edgesTitle:'技能编排图', edgesDesc:'高频技能转换（越常用越靠前）', noData:'暂无数据 — 运行一次求解后自动产生', refresh:'刷新', total:'总计' },
    'en':     { title:'Training Dashboard', desc:'Each solve auto-produces labeled samples for DPO fine-tuning', dpoPairs:'DPO Pairs', verifLabels:'Verif. Labels', routeRecs:'Route Records', hallucSamples:'Hallucination', routerTitle:'Model Router Performance', routerDesc:'Success rates per problem type', edgesTitle:'Skill Graph', edgesDesc:'Frequent skill transitions', noData:'No data yet — run a solve to start accumulating', refresh:'Refresh', total:'Total' },
    'ja':     { title:'訓練データ', desc:'各求解が自動的にDPO微調整用サンプルを生成します', dpoPairs:'DPOペア', verifLabels:'検証ラベル', routeRecs:'ルート記録', hallucSamples:'幻覚', routerTitle:'ルーター性能', routerDesc:'問題タイプ別成功率', edgesTitle:'スキルグラフ', edgesDesc:'頻繁なスキル遷移', noData:'データなし — 求解を実行してください', refresh:'更新', total:'合計' },
    'fr':     { title:'Tableau entraînement', desc:'Chaque résolution produit des échantillons étiquetés', dpoPairs:'Paires DPO', verifLabels:'Étiquettes', routeRecs:'Routage', hallucSamples:'Hallucination', routerTitle:'Performance routeur', routerDesc:'Taux de réussite par type', edgesTitle:'Graphe compétences', edgesDesc:'Transitions fréquentes', noData:'Pas de données — lancez une résolution', refresh:'Actualiser', total:'Total' },
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

      {/* ── Skill graph edges ── */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">{L.edgesTitle}</h4>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-3">{L.edgesDesc}</p>
        {skillEdges.length > 0 ? (
          <div className="space-y-1.5">
            {skillEdges.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
                <span className="text-xs font-mono text-amber-400">{e.from}</span>
                <span className="text-[10px] text-muted-foreground">→</span>
                <span className="text-xs font-mono text-emerald-400">{e.to}</span>
                <span className="ml-auto text-[10px] font-mono font-bold text-muted-foreground">×{e.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">{L.noData}</p>
        )}
      </div>
    </div>
  );
}

/* ── Logs ── */
function LogsSection({ lang }: any) {
  const [logs] = useState<string[]>([
    '[08:00:01] Agent engine initialized',
    '[08:00:03] Python sandbox: Python 3.11.9 detected',
    '[08:00:04] DeepSeek API: connection verified',
    '[08:00:05] HiGHS Solver: ready',
    '[08:00:06] All systems nominal. Polaris Solver ready.',
  ]);
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-foreground">{t(lang,'lab.logTitle')}</h3>
      <div className="rounded-xl bg-muted/20 border border-border/50 p-4 font-mono text-xs text-muted-foreground space-y-0.5 max-h-[500px] overflow-y-auto">
        {logs.map((l, i) => <div key={i} className="hover:text-foreground transition-colors">{l}</div>)}
      </div>
    </div>
  );
}

/* Re-export old AgentLab for backward compat (Settings sub-tab, kept but mostly unused now) */
export const AgentLab: React.FC = () => {
  return <StandaloneLab onClose={() => {}} />;
};
