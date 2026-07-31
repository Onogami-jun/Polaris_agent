import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';

interface SetupProgress {
  phase: string;
  percent: number;
  message: string;
  detail?: string;
  speed?: string;
  size?: string;
}

interface SandboxHealth {
  ready: boolean;
  pythonPath: string;
  pythonVersion: string;
  polarisVersion: string;
  highsVersion: string;
  totalExecutions: number;
  packages: { name: string; version: string }[];
}

const PHASE_INFO: Record<string, { label: string; icon: string; desc: string }> = {
  download: { label: '下载 Python', icon: '⬇', desc: '从 Python.org 下载嵌入式 Python 3.11 (~9MB)' },
  extract: { label: '解压文件', icon: '📦', desc: '解压到本地沙箱目录' },
  configure: { label: '配置环境', icon: '⚙', desc: '启用 pip 包管理器' },
  pip: { label: '安装 pip', icon: '📋', desc: '安装 Python 包管理器' },
  install: { label: '安装引擎', icon: '🔧', desc: 'pip install polaris-opt[highs]' },
  verify: { label: '验证安装', icon: '✓', desc: '检查所有模块是否正常加载' },
  repair: { label: '修复中', icon: '🔄', desc: '修复损坏的沙箱环境' },
  done: { label: '完成', icon: '✓', desc: '' },
};

export const SandboxWizard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<SandboxHealth | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onSandboxProgress((data: SetupProgress) => {
      setProgress(data);
      setLogs(l => [...l.slice(-20), `[${data.phase}] ${data.percent}% — ${data.message}`]);
      if (data.phase === 'done') {
        setDone(true);
        api.sandboxHealth().then((h: any) => setHealth(h)).catch(() => {});
      }
      if (data.phase === 'error') setError(data.message);
    });

    api.sandboxSetup().then((result: any) => {
      if (!result.success) setError(result.error || '安装失败');
      else {
        api.sandboxHealth().then((h: any) => setHealth(h)).catch(() => {});
        setDone(true);
      }
    }).catch((e: any) => setError(e.message));

    return () => {};
  }, []);

  const phase = progress?.phase || 'download';
  const info = PHASE_INFO[phase] || { label: phase, icon: '○', desc: '' };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={done ? onClose : undefined}>
      <div className="w-[480px] max-w-[94vw] max-h-[90vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
              style={{
                background: done ? 'hsl(164,76%,44%/.1)' : error ? 'hsl(0,72%,51%/.1)' : 'hsl(var(--primary)/.1)',
                color: done ? 'hsl(164,76%,44%)' : error ? 'hsl(0,72%,51%)' : 'hsl(var(--primary))',
              }}>
              {done ? '✓' : error ? '✗' : <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-converge"/>}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {done ? '沙箱就绪' : error ? '安装失败' : 'Python 沙箱安装'}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {done ? '所有求解工具已可用' : error ? error : '首次启动需要下载和配置'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Progress */}
          {!done && !error && progress &&
            <div className="contents">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <span className="text-lg">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{info.label}</div>
                  <div className="text-[10px] text-muted-foreground">{info.desc}</div>
                </div>
                <span className="text-sm font-mono text-primary font-bold">{progress.percent}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress.percent}%` }}/>
              </div>
              {(progress.speed || progress.size) &&
                <div className="flex gap-4 text-[10px] text-muted-foreground font-mono">
                  {progress.size && <span>大小: {progress.size}</span>}
                  {progress.speed && <span>速度: {progress.speed}</span>}
                </div>
              }
            </div>
          }

          {/* Done: health dashboard */}
          {done && health && (
            <div className="space-y-3">
              {/* Status grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Python', value: health.pythonVersion ? `v${health.pythonVersion.split(' ')[0]}` : '未安装', ok: !!health.pythonVersion },
                  { label: 'polaris-opt', value: health.polarisVersion || '未安装', ok: !!health.polarisVersion },
                  { label: 'HiGHS', value: health.highsVersion || '未安装', ok: !!health.highsVersion },
                  { label: 'pip 包', value: `${health.packages?.length || 0} 个`, ok: (health.packages?.length || 0) > 0 },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30">
                    <span className={item.ok ? 'text-emerald-500 text-xs' : 'text-muted-foreground/40 text-xs'}>{item.ok ? '✓' : '✗'}</span>
                    <div>
                      <div className="text-[10px] font-medium text-foreground">{item.label}</div>
                      <div className="text-[9px] text-muted-foreground font-mono">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Package list */}
              {health.packages && health.packages.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">已安装包</div>
                  <div className="max-h-[140px] overflow-y-auto space-y-0.5">
                    {health.packages.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-2.5 py-1 rounded text-[10px] font-mono text-muted-foreground hover:bg-muted/50">
                        <span>{p.name}</span>
                        <span className="opacity-50">{p.version}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Install log */}
          {logs.length > 0 && (
            <details className="text-[9px] font-mono">
              <summary className="cursor-pointer text-muted-foreground/50 hover:text-muted-foreground select-none">安装日志</summary>
              <div className="mt-1 p-2 rounded bg-muted/30 text-muted-foreground/60 space-y-0.5 max-h-[120px] overflow-y-auto">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </details>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border flex gap-2">
          {error && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => {
              setError(''); setDone(false); setProgress(null); setLogs([]);
              window.electronAPI?.sandboxRepair();
            }}>
              修复重试
            </Button>
          )}
          <Button
            onClick={onClose}
            className="flex-1 h-9"
            variant={done ? 'default' : 'outline'}
            disabled={!done && !error}
          >
            {done ? '开始使用' : error ? '关闭' : '安装中...'}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ── Mini sandbox health panel (for right sidebar) ── */
export const SandboxHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<SandboxHealth | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.sandboxHealth().then((h: any) => setHealth(h)).catch(() => {});
    const iv = setInterval(() => {
      api.sandboxHealth().then((h: any) => setHealth(h)).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  if (!health) return null;

  return (
    <div className="px-2 py-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <span className={health.ready ? 'text-emerald-500' : 'text-amber-500'}>⬡</span>
        <span className="flex-1 text-left">沙箱 {health.ready ? '就绪' : '未安装'}</span>
        <span className="text-[8px]">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="space-y-1 px-2 pb-2">
          {[
            { label: 'Python', ok: !!health.pythonVersion },
            { label: 'polaris', ok: !!health.polarisVersion },
            { label: 'HiGHS', ok: !!health.highsVersion },
            { label: '已执行', ok: true, extra: `${health.totalExecutions || 0} 次` },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[8px] font-mono">
              <span className="text-muted-foreground/50">{item.label}</span>
              <span className={item.ok ? 'text-emerald-500' : 'text-muted-foreground/30'}>{item.ok ? (item.extra || '✓') : '✗'}</span>
            </div>
          ))}
          {!health.ready && (
            <button
              onClick={() => window.electronAPI?.sandboxSetup()}
              className="w-full mt-1 px-2 py-1 rounded text-[8px] text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
            >
              + 安装沙箱
            </button>
          )}
        </div>
      )}
    </div>
  );
};
