import React from 'react';
import { useAppSelector } from '../store';

const AgentDashboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { sessions, settings, contextTokens } = useAppSelector(s => s.chat);
  const totalMsgs = sessions.reduce((a, s) => a + s.messages.length, 0);
  const activePlugins = settings.plugins.filter(p => p.enabled);
  const memoryEntries = settings.memory.entries.length;
  const pct = Math.min(Math.round(contextTokens.used / Math.max(contextTokens.total, 1) * 100), 100);
  const providerStatus = [
    { name: 'DeepSeek', key: settings.apiKeys.deepseek || '内置', ok: true },
    { name: 'Anthropic', key: settings.apiKeys.anthropic, ok: !!settings.apiKeys.anthropic },
    { name: 'OpenAI', key: settings.apiKeys.openai, ok: !!settings.apiKeys.openai },
  ];

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-panel" onClick={e => e.stopPropagation()} style={{ height: 440 }}>
        <div className="ps-tabs" style={{ width: 160 }}><div className="ps-tab-header">仪表盘</div></div>
        <div className="ps-content">
          <div className="ps-section"><h3>系统状态</h3>
            <div className="db-grid">
              <div className="db-card"><div className="db-val">{sessions.length}</div><div className="db-label">对话数</div></div>
              <div className="db-card"><div className="db-val">{totalMsgs}</div><div className="db-label">消息总数</div></div>
              <div className="db-card"><div className="db-val">{memoryEntries}</div><div className="db-label">记忆条目</div></div>
              <div className="db-card"><div className="db-val">{activePlugins.length}/{settings.plugins.length}</div><div className="db-label">活跃插件</div></div>
            </div>
          </div>
          <div className="ps-section"><h3>上下文窗口</h3>
            <div className="db-bar-wrap"><div className="db-bar"><div className="db-bar-fill" style={{ width: pct + '%', background: pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--green)' }} /></div><span className="db-bar-label">{contextTokens.used}/{contextTokens.total} tokens ({pct}%)</span></div>
          </div>
          <div className="ps-section"><h3>模型供应商</h3>
            {providerStatus.map(p => <div key={p.name} className="ps-row"><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.name}</span><span className={'db-status' + (p.ok ? ' on' : ' off')}>{p.ok ? '● 在线' : '○ 未配置'}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;
