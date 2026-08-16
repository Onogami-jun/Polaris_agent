import React, { useState, useEffect } from 'react';
import { getStoredServers, saveServers, type MCPServer } from '../utils/mcp';

/**
 * MCP 服务器管理 — 接真实 IPC（mcp:start / mcp:stop / mcp:list）
 * 配置存本地（getStoredServers/saveServers），运行时进程由主进程 mcpProcesses 管理。
 */
const MCPSettings: React.FC = () => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [runningIds, setRunningIds] = useState<string[]>([]);

  useEffect(() => {
    setServers(getStoredServers());
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    const api = (window as any).electronAPI;
    if (!api?.mcpList) return;
    try {
      const list = await api.mcpList();
      setRunningIds((list || []).filter((m: any) => m.running).map((m: any) => m.id));
    } catch {}
  };

  const start = async (s: MCPServer) => {
    const api = (window as any).electronAPI;
    if (!api?.mcpStart) return;
    await api.mcpStart({ id: s.id, command: s.command, args: s.args, env: s.env });
    setTimeout(refreshStatus, 600);
  };

  const stop = async (id: string) => {
    const api = (window as any).electronAPI;
    if (!api?.mcpStop) return;
    await api.mcpStop(id);
    setTimeout(refreshStatus, 600);
  };

  const toggle = (id: string) => {
    const next = servers.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setServers(next); saveServers(next);
  };

  const updateEnv = (id: string, key: string, value: string) => {
    const next = servers.map(s => (s.id === id ? { ...s, env: { ...s.env, [key]: value } } : s));
    setServers(next); saveServers(next);
  };

  return (
    <div className="space-y-3">
      {servers.map(s => {
        const running = runningIds.includes(s.id);
        return (
          <div key={s.id} className="p-3 rounded-xl border border-border/50 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{s.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{s.command} {s.args?.join(' ')}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={'text-[10px] font-mono ' + (running ? 'text-emerald-500' : 'text-muted-foreground')}>{running ? '● 运行中' : s.enabled ? '○ 已启用' : '○ 已停止'}</span>
                {s.enabled && (running
                  ? <button onClick={() => stop(s.id)} className="px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors">停止</button>
                  : <button onClick={() => start(s)} className="px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-[10px] text-primary font-mono transition-colors">启动</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">启用</span>
              <div onClick={() => toggle(s.id)} className={'w-9 h-5 rounded-full cursor-pointer transition-colors relative ' + (s.enabled ? 'bg-primary' : 'bg-muted-foreground/20')}>
                <div className={'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ' + (s.enabled ? 'left-[18px]' : 'left-0.5')} />
              </div>
            </div>
            {s.enabled && s.env && Object.keys(s.env).map(key => (
              <div key={key} className="flex items-center gap-2 mt-2">
                <label className="text-[10px] w-24 shrink-0 text-muted-foreground">{key}</label>
                <input type="password" value={s.env?.[key] || ''} onChange={e => updateEnv(s.id, key, e.target.value)} placeholder="API Key..." className="flex-1 h-7 rounded-md border border-border bg-muted px-2 text-[10px] font-mono outline-none focus:ring-2 focus:ring-ring" />
              </div>
            ))}
          </div>
        );
      })}
      <div className="flex items-center justify-center py-4 rounded-xl border-2 border-dashed border-border/50 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
        <span className="text-xs text-muted-foreground">+ 添加 MCP 服务器</span>
      </div>
    </div>
  );
};

export default MCPSettings;
