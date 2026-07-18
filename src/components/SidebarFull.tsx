import React, { useState, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { newSession as ns, setActiveSession, deleteSession, toggleSidebar, togglePlugin, setStrategy } from '../store/chatSlice';
import type { Strategy } from '../store/chatSlice';
import { deleteSessionStorage } from '../store/persist';

const SidebarFull: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const d = useAppDispatch();
  const { sessions, activeSessionId, settings, strategy } = useAppSelector(s => s.chat);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'chats'|'tools'|'plugins'>('chats');
  const [ws, setWs] = useState('all'); // workspace filter

  const workspaces = useMemo(() => {
    const names = new Set(sessions.map(s => s.name.split(/\s[-–—]/)[0]).filter(Boolean));
    return ['all', ...Array.from(names).slice(0, 10)];
  }, [sessions]);

  const list = useMemo(() => {
    let filtered = sessions;
    if (q) filtered = filtered.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    if (ws !== 'all') filtered = filtered.filter(s => s.name.startsWith(ws));
    return filtered;
  }, [sessions, q, ws]);

  const fmt = (t: number) => { const d2 = new Date(t); return d2.getMonth()+1+'/'+d2.getDate(); };
  const pluginStatus = settings.plugins.filter(p => p.enabled).length;

  return (
    <div className="side">
      {/* Header */}
      <div className="side-hd">
        <div className="side-logo">POLARIS</div>
        <button onClick={onClose} className="side-cl">✕</button>
      </div>

      {/* New Chat */}
      <button className="side-new" onClick={() => d(ns())}>＋ 新对话</button>

      {/* Tab bar */}
      <div className="side-tabs">
        <button className={'side-tb' + (tab === 'chats' ? ' on' : '')} onClick={() => setTab('chats')}>对话</button>
        <button className={'side-tb' + (tab === 'tools' ? ' on' : '')} onClick={() => setTab('tools')}>工具</button>
        <button className={'side-tb' + (tab === 'plugins' ? ' on' : '')} onClick={() => setTab('plugins')}>
          插件{pluginStatus > 0 ? <span className="side-dot-sm" /> : null}
        </button>
      </div>

      {/* Chats tab */}
      {tab === 'chats' && (
        <>
          <div className="side-srch"><input placeholder="搜索…" value={q} onChange={e => setQ(e.target.value)} /></div>
          {/* Workspace filter */}
          {workspaces.length > 1 && (
            <div className="side-ws">
              {workspaces.map(w => (
                <button key={w} className={'side-wb' + (ws === w ? ' on' : '')} onClick={() => setWs(w)}>
                  {w === 'all' ? '全部' : w}
                </button>
              ))}
            </div>
          )}
          <div className="side-list">
            {list.map(s => (
              <div key={s.id} className={'side-it' + (s.id === activeSessionId ? ' on' : '')}
                onClick={() => d(setActiveSession(s.id))}>
                <span className="side-dot" />
                <span className="side-nm">{s.name}</span>
                <span className="side-dt">{fmt(s.createdAt)}</span>
                <button className="side-del" onClick={e => { e.stopPropagation(); if (s.id !== 'default') { d(deleteSession(s.id)); deleteSessionStorage(s.id); } }}>×</button>
              </div>
            ))}
            {list.length === 0 && <div className="side-empty">没有匹配的对话</div>}
          </div>
        </>
      )}

      {/* Tools tab */}
      {tab === 'tools' && (
        <div className="side-tools">
          <div className="side-section-title">快捷操作</div>
          <button className="side-tool" onClick={async () => { try { const api = window.electronAPI; if (api) { const ss = await api.desktopScreenshot(); } } catch {} }}>
            <span className="side-ti">📷</span><span>截图分析</span>
          </button>
          <button className="side-tool" onClick={() => { d(ns()); d(setStrategy('ensemble' as Strategy)); }}>
            <span className="side-ti">◈</span><span>多模型协同</span>
          </button>
          <button className="side-tool" onClick={async () => { try { const api = window.electronAPI; if (api) { const info = await api.desktopSystemInfo(); } } catch {} }}>
            <span className="side-ti">🖥</span><span>系统信息</span>
          </button>
          <button className="side-tool" onClick={() => { d(ns()); }}>
            <span className="side-ti">🧹</span><span>清理对话</span>
          </button>

          <div className="side-section-title" style={{ marginTop: 16 }}>当前策略</div>
          <div className="side-strat-row">
            {(['best_quality', 'cost_optimized', 'ensemble'] as Strategy[]).map(s => (
              <button key={s} className={'side-strat' + (strategy === s ? ' on' : '')} onClick={() => d(setStrategy(s))}>
                {{best_quality: '优质', cost_optimized: '省钱', ensemble: '协同'}[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plugins tab */}
      {tab === 'plugins' && (
        <div className="side-tools">
          <div className="side-section-title">已安装插件</div>
          {settings.plugins.map(p => (
            <div key={p.id} className="side-plugin-row">
              <div>
                <div className="side-pn">{p.name}</div>
                <div className="side-pd">{p.description}</div>
              </div>
              <button className={'side-ptoggle' + (p.enabled ? ' on' : '')} onClick={() => d(togglePlugin(p.id))}>
                {p.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
          <div className="side-mcp-note">MCP Registry 即将开放</div>
        </div>
      )}

      {/* Footer */}
      <div className="side-ft-row">
        <span>v0.9.0</span>
        <span className="side-ft-dot" />
        <span>BitWool</span>
      </div>
    </div>
  );
};

export default SidebarFull;
