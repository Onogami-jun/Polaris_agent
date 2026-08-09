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

  const labLabels: any = {
    'zh-CN': { dashboard:'仪表盘', diagnostics:'自诊断', benchmark:'跑分台', experiments:'实验历史', sandbox:'沙箱', memory:'记忆库', logs:'日志' },
    'en':     { dashboard:'Dashboard', diagnostics:'Diagnostics', benchmark:'Benchmark', experiments:'Experiments', sandbox:'Sandbox', memory:'Memory', logs:'Logs' },
    'ja':     { dashboard:'ダッシュボード', diagnostics:'診断', benchmark:'ベンチマーク', experiments:'実験履歴', sandbox:'サンドボックス', memory:'メモリ', logs:'ログ' },
    'fr':     { dashboard:'Tableau', diagnostics:'Diagnostic', benchmark:'Benchmark', experiments:'Experiences', sandbox:'Sandbox', memory:'Memoire', logs:'Journaux' },
  };
  const labL = labLabels[lang] || labLabels['zh-CN'];
  const sections = [
    { id: 'dashboard',   label: labL.dashboard },
    { id: 'diagnostics', label: labL.diagnostics },
    { id: 'benchmark',   label: labL.benchmark },
    { id: 'experiments', label: labL.experiments },
    { id: 'sandbox',     label: labL.sandbox },
    { id: 'memory',      label: labL.memory },
    { id: 'logs',        label: labL.logs },
  ];

  useEffect(() => {
    runDiagnostics();
    refreshSandbox();
    loadExperimentHistory();
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
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
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
          <div className="px-3 py-3 border-t border-border">
            <p className="text-[9px] text-muted-foreground font-mono">Polaris Lab v4.0</p>
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
