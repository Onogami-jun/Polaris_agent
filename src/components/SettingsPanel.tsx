import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, type Theme, type Language, type PluginInfo } from '../store/chatSlice';

const SettingsPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const s = useAppSelector(state => state.chat.settings);
  const [tab, setTab] = useState('general');
  const tabs = [
    { id:'general',label:'General',icon:'⚙' },{ id:'models',label:'Models',icon:'▣' },
    { id:'agent',label:'Agent',icon:'◈' },{ id:'plugins',label:'Plugins',icon:'⎔' },
    { id:'connect',label:'Connect',icon:'◎' },
  ];
  return (
    <div className="ps-overlay" onClick={() => dispatch(toggleSettings())}>
      <div className="ps-panel" onClick={e => e.stopPropagation()}>
        <div className="ps-tabs"><div className="ps-tab-header">Settings</div>
          {tabs.map(t => <div key={t.id} className={'ps-tab'+(tab===t.id?' sel':'')} onClick={()=>setTab(t.id)}><span className="ps-tab-icon">{t.icon}</span><span>{t.label}</span></div>)}
        </div>
        <div className="ps-content">
          {tab==='general'&&<div className="ps-section"><h3>Appearance</h3>
            <div className="ps-row"><label>Theme</label><select value={s.theme} onChange={e=>dispatch(setTheme(e.target.value as Theme))}><option value="dark">Dark</option><option value="light">Light</option></select></div>
            <div className="ps-row"><label>Language</label><select value={s.language} onChange={e=>dispatch(setLanguage(e.target.value as Language))}><option value="en">English</option><option value="zh-CN">中文</option></select></div>
            <div className="ps-row"><label>Font Size ({s.fontSize}px)</label><input type="range" min="12" max="22" value={s.fontSize} onChange={e=>dispatch(setFontSize(Number(e.target.value)))}/></div>
          </div>}
          {tab==='models'&&<div className="ps-section"><h3>Model API Keys</h3>
            {['deepseek','anthropic','openai'].map(p=><div key={p} className="ps-row"><label style={{textTransform:'capitalize'}}>{p}</label><input type="password" value={(s.apiKeys as any)[p]} onChange={e=>dispatch(setApiKey({provider:p,key:e.target.value}))} placeholder="sk-..."/></div>)}
            <p className="ps-note">Built-in DeepSeek key included. Add your own for other providers.</p>
          </div>}
          {tab==='agent'&&<div className="ps-section"><h3>Agent Configuration</h3>
            <div className="ps-row"><label>Agent Name</label><input value={s.agent.name} onChange={e=>dispatch(updateAgentConfig({name:e.target.value}))}/></div>
            <div className="ps-row"><label>Reasoning Style</label><select value={s.agent.reasoningStyle} onChange={e=>dispatch(updateAgentConfig({reasoningStyle:e.target.value as any}))}><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="creative">Creative</option></select></div>
            <div className="ps-row"><label>Max Tokens</label><input type="number" value={s.agent.maxTokens} onChange={e=>dispatch(updateAgentConfig({maxTokens:Number(e.target.value)}))} min={512} max={16384}/></div>
            <div className="ps-row"><label>Temperature ({s.agent.temperature})</label><input type="range" min="0" max="2" step="0.1" value={s.agent.temperature} onChange={e=>dispatch(updateAgentConfig({temperature:Number(e.target.value)}))}/></div>
            <div className="ps-row"><label>Auto-Execute Actions</label><input type="checkbox" checked={s.agent.autoExecute} onChange={e=>dispatch(updateAgentConfig({autoExecute:e.target.checked}))}/></div>
          </div>}
          {tab==='plugins'&&<div className="ps-section"><h3>Installed Plugins</h3>
            {s.plugins.map((p:PluginInfo)=><div key={p.id} className="ps-row" style={{justifyContent:'space-between'}}><div><div style={{fontWeight:600,fontSize:13}}>{p.name}</div><div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{p.description}</div></div><div className="ps-toggle" onClick={()=>dispatch(togglePlugin(p.id))}><div className={'ps-toggle-knob'+(p.enabled?' on':'')}/></div></div>)}
            <div style={{marginTop:14,padding:'12px 14px',background:'var(--card)',borderRadius:8,border:'1px dashed var(--border)',textAlign:'center',cursor:'pointer',color:'var(--text3)',fontSize:12}}>+ Install Plugin from MCP Registry</div>
          </div>}
          {tab==='connect'&&<div className="ps-section"><h3>Mobile Connection</h3>
            <div className="ps-row"><label>Enable Mobile</label><input type="checkbox" checked={s.mobileLink.enabled} onChange={e=>dispatch(updateMobileLink({enabled:e.target.checked}))}/></div>
            {s.mobileLink.enabled&&<div className="ps-card"><p>Scan QR code to connect your mobile device. Coming soon.</p></div>}
            <h3 style={{marginTop:20}}>Third-Party API</h3>
            <div className="ps-row"><label>Enable API Access</label><input type="checkbox" checked={s.thirdParty.apiEnabled} onChange={e=>dispatch(updateThirdParty({apiEnabled:e.target.checked}))}/></div>
            {s.thirdParty.apiEnabled&&<><div className="ps-row"><label>API Port</label><input type="number" value={s.thirdParty.apiPort} onChange={e=>dispatch(updateThirdParty({apiPort:Number(e.target.value)}))}/></div><div className="ps-row"><label>Webhook URL</label><input value={s.thirdParty.webhookUrl} onChange={e=>dispatch(updateThirdParty({webhookUrl:e.target.value}))} placeholder="https://..."/></div></>}
            <h3 style={{marginTop:20}}>Proxy</h3>
            <div className="ps-row"><label>Enable Proxy</label><input type="checkbox" checked={s.proxy.enabled} onChange={e=>dispatch(updateProxy({enabled:e.target.checked}))}/></div>
            {s.proxy.enabled&&<><div className="ps-row"><label>Host</label><input value={s.proxy.host} onChange={e=>dispatch(updateProxy({host:e.target.value}))}/></div><div className="ps-row"><label>Port</label><input value={s.proxy.port} onChange={e=>dispatch(updateProxy({port:e.target.value}))}/></div></>}
          </div>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
