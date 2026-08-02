import React, { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { Button } from './ui/button';
import { Input } from './ui/input';

/* ── Benchmark questions ───────────────────────────── */
const BENCHMARKS = [
  { id: 'knapsack', label: '背包', prompt: '背包容量50，3件物品：物品1价值60重量10，物品2价值100重量20，物品3价值120重量30。求最优选择。', groundTruth: '选物品2和3，总价值220' },
  { id: 'scheduling', label: '单机排产', prompt: '3个工件，处理时间分别为2、3、1。求最小化总完成时间的最优加工顺序。', groundTruth: 'SPT规则：工件3→1→2' },
  { id: 'assignment', label: '指派', prompt: '3个工人分配到3个任务，成本矩阵：工人1: 9,2,7；工人2: 6,4,3；工人3: 5,8,1。求最小总成本。', groundTruth: '工人1→任务2，工人2→任务3，工人3→任务1，总成本=10' },
];

/* ═══════════════════════════════════════════════════════
   AGENT LAB
   ═══════════════════════════════════════════════════════ */
export const AgentLab: React.FC = () => {
  const chat = useAppSelector(s => s.chat);
  const auth = useAppSelector(s => s.auth);
  const engine = chat.engineStatus;

  // ── 1. Diagnostics ──
  const [diag, setDiag] = useState<any>(null);

  // ── 2. Benchmark ──
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResults, setBenchResults] = useState<any[]>([]);

  // ── 3. Prompt Arena ──
  const [arenaPrompt, setArenaPrompt] = useState('用自然语言解释Benders分解的基本原理');
  const [arenaA, setArenaA] = useState('');
  const [arenaB, setArenaB] = useState('');
  const [arenaRunning, setArenaRunning] = useState(false);
  const [arenaVotes, setArenaVotes] = useState({ a: 0, b: 0 });

  // ── 4. Dashboard ──
  const [usageStats, setUsageStats] = useState({ totalCalls: 0, totalTokens: 0, favSkill: '', uptime: '' });

  // ── 5. Sandbox ──
  const [sandboxHealth, setSandboxHealth] = useState<any>(null);
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [pkgInput, setPkgInput] = useState('');
  const [pkgInstalling, setPkgInstalling] = useState(false);

  // ── 6. Memory ──
  const [memInput, setMemInput] = useState('');
  const [memories, setMemories] = useState<{ key: string; value: string; timestamp: number }[]>([]);

  /* ── Init ──────────────────────────────────────────── */
  useEffect(() => {
    runDiagnostics();
    refreshSandbox();
    setMemories(chat.settings.memory.entries);
    // Usage stats
    setUsageStats({
      totalCalls: auth.tokenUsageCount || 0,
      totalTokens: chat.contextTokens?.used || 0,
      favSkill: 'discuss',
      uptime: '--',
    });
  }, []);

  /* ── Diagnostics ───────────────────────────────────── */
  const runDiagnostics = () => {
    const api = window.electronAPI;
    if (!api) return;
    api.healthCheck().then((r: any) => {
      if (Array.isArray(r)) setDiag(r);
    }).catch(() => {});
  };

  /* ── Benchmark ──────────────────────────────────────── */
  const runBenchmark = async () => {
    const api = window.electronAPI;
    if (!api) return;
    setBenchRunning(true);
    const results: any[] = [];
    for (const b of BENCHMARKS) {
      const start = Date.now();
      try {
        const res = await api.query({ text: b.prompt, strategy: 'best_quality', apiKeys: {} });
        const elapsed = Date.now() - start;
        const content = res?.responses?.[0]?.content || '';
        const passed = content.toLowerCase().includes(b.groundTruth.split('，')[0].toLowerCase()) ||
                       content.includes(b.groundTruth.slice(0, 8));
        results.push({ id: b.id, label: b.label, elapsed: elapsed + 'ms', passed, content: content.slice(0, 200) });
      } catch (e: any) {
        results.push({ id: b.id, label: b.label, elapsed: 'FAIL', passed: false, content: e.message });
      }
      // Small delay between benchmarks
      await new Promise(r => setTimeout(r, 500));
    }
    setBenchResults(results);
    setBenchRunning(false);
  };

  /* ── Prompt Arena ───────────────────────────────────── */
  const runArena = async () => {
    setArenaRunning(true);
    setArenaA(''); setArenaB('');
    const api = window.electronAPI;
    if (!api) { setArenaRunning(false); return; }
    // Run two configs in parallel
    const run = async (systemPrompt: string) => {
      const res = await api.query({ text: arenaPrompt, strategy: 'best_quality', systemPrompt, apiKeys: {} });
      return res?.responses?.[0]?.content || '(无回复)';
    };
    const [a, b] = await Promise.all([
      run('你是Polaris，简洁专业的运筹优化助手。用中文回复，不超过200字。'),
      run('你是Polaris，乐于助人的运筹优化导师。用中文回复，可以给详细例子，语气亲切。'),
    ]);
    setArenaA(a); setArenaB(b);
    setArenaRunning(false);
  };

  /* ── Sandbox ────────────────────────────────────────── */
  const refreshSandbox = () => {
    const api = window.electronAPI;
    if (!api) return;
    api.sandboxHealth().then((h: any) => setSandboxHealth(h)).catch(() => {});
    api.sandboxPackages().then((p: any[]) => setPkgs(p || [])).catch(() => {});
  };

  const installPkg = () => {
    if (!pkgInput.trim()) return;
    const api = window.electronAPI;
    if (!api) return;
    setPkgInstalling(true);
    api.sandboxInstallPackage(pkgInput.trim()).then(() => {
      setPkgInstalling(false); setPkgInput('');
      setTimeout(refreshSandbox, 2000);
    }).catch(() => setPkgInstalling(false));
  };

  /* ── Memory ─────────────────────────────────────────── */
  const addMemoryEntry = () => {
    if (!memInput.trim()) return;
    setMemories(p => [...p, { key: 'manual', value: memInput, timestamp: Date.now() }]);
    setMemInput('');
  };

  const clearMemory = () => {
    setMemories([]);
  };

  /* ══════════════ RENDER ═══════════════════════════ */
  return (
    <div className="space-y-6 pb-8">

      {/* ── Card 1: Agent 自诊断 ── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">🧠 Agent 自诊断</h4>
        {diag ? (
          <div className="grid grid-cols-2 gap-2">
            {diag.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30">
                <span className={d.ok ? 'text-emerald-500 text-xs' : 'text-destructive text-xs'}>{d.ok ? '✓' : '✗'}</span>
                <div>
                  <div className="text-[11px] font-medium text-foreground">{d.service}</div>
                  <div className="text-[9px] text-muted-foreground font-mono truncate max-w-[200px]">{d.ok ? (d.cmd || d.detail || '正常') : (d.error || '异常')}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">点击刷新获取诊断信息</p>
        )}
        <Button variant="outline" size="sm" className="mt-3 h-7 text-[10px]" onClick={runDiagnostics}>刷新诊断</Button>
      </div>

      {/* ── Card 2: 性能跑分台 ── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">⚡ 性能跑分台</h4>
        <p className="text-[11px] text-muted-foreground mb-3">3 道标准优化题，测量 Agent 求解准确率与响应时间。</p>
        {benchResults.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden mb-3">
            <table className="w-full text-[10px]">
              <thead className="bg-muted/50"><tr>
                <th className="px-3 py-2 text-left font-medium">题目</th>
                <th className="px-3 py-2 text-left font-medium">耗时</th>
                <th className="px-3 py-2 text-left font-medium">通过</th>
              </tr></thead>
              <tbody>
                {benchResults.map((br: any, i: number) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2">{br.label}</td>
                    <td className="px-3 py-2 font-mono">{br.elapsed}</td>
                    <td className="px-3 py-2">{br.passed ? <span className="text-emerald-500">✓</span> : <span className="text-destructive">✗</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={runBenchmark} disabled={benchRunning}>
          {benchRunning ? '跑分中...' : '开始跑分'}
        </Button>
      </div>

      {/* ── Card 3: Prompt 竞技场 ── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">🎯 Prompt 竞技场</h4>
        <p className="text-[11px] text-muted-foreground mb-2">同一问题用两种 System Prompt 生成回复，对比效果。</p>
        <Input placeholder="输入测试问题" value={arenaPrompt} onChange={e => setArenaPrompt(e.target.value)} className="h-8 text-xs mb-2" />
        <Button variant="outline" size="sm" className="h-7 text-[10px] mb-3" onClick={runArena} disabled={arenaRunning}>
          {arenaRunning ? '生成中...' : '同步对比'}
        </Button>
        {(arenaA || arenaB) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-foreground">A · 简洁风格</span>
                <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => setArenaVotes(v => ({...v, a: v.a+1}))}>👍 {arenaVotes.a}</button>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-[10px] leading-relaxed text-muted-foreground max-h-[160px] overflow-y-auto">{arenaA}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-foreground">B · 详细风格</span>
                <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => setArenaVotes(v => ({...v, b: v.b+1}))}>👍 {arenaVotes.b}</button>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-[10px] leading-relaxed text-muted-foreground max-h-[160px] overflow-y-auto">{arenaB}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Card 4: 用量仪表盘 ── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">📊 用量仪表盘</h4>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'API 调用次数', value: usageStats.totalCalls + ' 次' },
            { label: 'Token 消耗', value: (usageStats.totalTokens/1000).toFixed(0) + 'K' },
            { label: '沙箱 Python', value: engine.python ? '✓' : '✗', ok: engine.python },
            { label: 'polaris-opt', value: engine.polaris ? '✓' : '✗', ok: engine.polaris },
          ].map((item, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/30">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{item.label}</div>
              <div className={'text-sm font-mono font-bold mt-1 ' + (item.ok !== undefined ? (item.ok ? 'text-emerald-500' : 'text-destructive') : 'text-foreground')}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Card 5: 沙箱管理台 ── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">🔬 沙箱管理台</h4>
        <div className="flex items-center gap-2 mb-3">
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={refreshSandbox}>刷新状态</Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => { const api = window.electronAPI; if (api) { api.onSandboxProgress(() => {}); api.sandboxSetup(); } }}>一键安装</Button>
        </div>
        {sandboxHealth && (
          <div className="flex gap-3 mb-3 text-[10px]">
            <div className="flex-1 p-2.5 rounded-lg bg-muted/30">
              <span className="text-muted-foreground">Python:</span>
              <span className={sandboxHealth.ready ? 'text-emerald-500 ml-1' : 'text-destructive ml-1'}>{sandboxHealth.pythonVersion || '未安装'}</span>
            </div>
            <div className="flex-1 p-2.5 rounded-lg bg-muted/30">
              <span className="text-muted-foreground">polaris:</span>
              <span className={sandboxHealth.polarisReady ? 'text-emerald-500 ml-1' : 'text-destructive ml-1'}>{sandboxHealth.polarisReady ? '已安装' : '未安装'}</span>
            </div>
          </div>
        )}
        {/* Package installer */}
        <div className="flex gap-2 mb-2">
          <Input placeholder="包名 (如 numpy)" value={pkgInput} onChange={e => setPkgInput(e.target.value)} className="h-8 text-xs flex-1" />
          <Button size="sm" className="h-8 text-[10px]" onClick={installPkg} disabled={pkgInstalling}>{pkgInstalling ? '安装中' : '安装'}</Button>
        </div>
        {pkgs.length > 0 && (
          <div className="max-h-[120px] overflow-y-auto rounded-lg bg-muted/20 p-2">
            {pkgs.map((p, i) => (
              <div key={i} className="flex justify-between px-2 py-1 text-[9px] font-mono text-muted-foreground hover:bg-muted/50 rounded">
                <span>{p.name}</span><span className="opacity-50">{p.version}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Card 6: Agent 记忆库 ── */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">📝 Agent 记忆库</h4>
        <p className="text-[11px] text-muted-foreground mb-2">Agent 可以记住你的偏好，提升后续对话质量。你也可以手动添加指令。</p>
        <div className="flex gap-2 mb-3">
          <Input placeholder='例如："我习惯用 Gurobi 语法"' value={memInput} onChange={e => setMemInput(e.target.value)} className="h-8 text-xs flex-1" />
          <Button size="sm" className="h-8 text-[10px]" onClick={addMemoryEntry}>添加</Button>
        </div>
        {memories.length > 0 ? (
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {memories.slice().reverse().map((m, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 text-[10px] text-muted-foreground">
                <span className="flex-1 truncate">{m.value}</span>
                <span className="text-[8px] font-mono opacity-50">{new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
            <button className="w-full text-[9px] text-destructive hover:underline py-1" onClick={clearMemory}>清除全部</button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/50">暂无记忆。Agent 会在对话中自动学习你的偏好。</p>
        )}
      </div>

    </div>
  );
};
