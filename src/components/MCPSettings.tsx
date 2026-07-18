import React, { useState, useEffect } from 'react';
import { getStoredServers, saveServers, type MCPServer } from '../utils/mcp';

const MCPSettings: React.FC = () => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  useEffect(() => { setServers(getStoredServers()); }, []);

  const toggle = (id: string) => {
    const next = servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setServers(next); saveServers(next);
  };
  const updateEnv = (id: string, key: string, value: string) => {
    const next = servers.map(s => s.id === id ? { ...s, env: { ...s.env, [key]: value } } : s);
    setServers(next); saveServers(next);
  };

  return (
    <div className="ps-section">
      <h3>MCP 服务器</h3>
      {servers.map(s => (
        <div key={s.id} style={{ marginBottom: 14, padding: 12, background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{s.command} {s.args?.join(' ')}</div>
            </div>
            <div className="ps-toggle" onClick={() => toggle(s.id)}>
              <div className={'ps-toggle-knob' + (s.enabled ? ' on' : '')} />
            </div>
          </div>
          {s.enabled && s.env && Object.keys(s.env).map(key => (
            <div key={key} className="ps-row" style={{ marginBottom: 4 }}>
              <label style={{ fontSize: 10 }}>{key}</label>
              <input type="password" value={s.env?.[key] || ''} onChange={e => updateEnv(s.id, key, e.target.value)} placeholder="API Key..." style={{ fontSize: 10 }} />
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right' }}>
            {s.status === 'running' ? '● 运行中' : s.enabled ? '○ 已启用' : '○ 已停止'}
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'center', padding: 12, border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text3)', fontSize: 12 }}>
        + 添加 MCP 服务器
      </div>
    </div>
  );
};

export default MCPSettings;
