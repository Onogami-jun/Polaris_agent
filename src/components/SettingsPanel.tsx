import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, type Theme, type Language, type PluginInfo } from '../store/chatSlice';

const SettingsPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const s = useAppSelector(state => state.chat.settings);
  const [tab, setTab] = useState('general');
  const tabs = [
    { id:'general',label:'通用',icon:'⚙' },{ id:'models',label:'模型',icon:'▣' },
    { id:'agent',label:'代理',icon:'◈' },{ id:'plugins',label:'插件',icon:'⎔' },
    { id:'connect',label:'连接',icon:'◎' },
  ];
  const lang = s.language;
  const isZh = lang === 'zh-CN';

  return (
    <div className="ps-overlay" onClick={() => dispatch(toggleSettings())}>
      <div className="ps-panel" onClick={e => e.stopPropagation()}>
        <div className="ps-tabs"><div className="ps-tab-header">{isZh?'设置':'Settings'}</div>
          {tabs.map(t => <div key={t.id} className={'ps-tab'+(tab===t.id?' sel':'')} onClick={()=>setTab(t.id)}><span className="ps-tab-icon">{t.icon}</span><span>{t.label}</span></div>)}
        </div>
        <div className="ps-content">
          {tab==='general'&&<div className="ps-section">
            <h3>{isZh?'外观':'Appearance'}</h3>
            <div className="ps-row"><label>{isZh?'主题':'Theme'}</label><select value={s.theme} onChange={e=>dispatch(setTheme(e.target.value as Theme))}><option value="dark">{isZh?'暗色':'Dark'}</option><option value="light">{isZh?'亮色':'Light'}</option></select></div>
            <div className="ps-row"><label>{isZh?'语言':'Language'}</label><select value={s.language} onChange={e=>dispatch(setLanguage(e.target.value as Language))}><option value="zh-CN">中文</option><option value="en">English</option></select></div>
            <div className="ps-row"><label>{isZh?'字号':'Font Size'} ({s.fontSize}px)</label><input type="range" min="12" max="22" value={s.fontSize} onChange={e=>dispatch(setFontSize(Number(e.target.value)))}/></div>
          </div>}
          {tab==='models'&&<div className="ps-section"><h3>{isZh?'模型 API 密钥':'Model API Keys'}</h3>
            {['deepseek','anthropic','openai'].map(p=><div key={p} className="ps-row"><label style={{textTransform:'capitalize'}}>{p}</label><input type="password" value={(s.apiKeys as any)[p]} onChange={e=>dispatch(setApiKey({provider:p,key:e.target.value}))} placeholder="sk-..."/></div>)}
            <p className="ps-note">{isZh?'内置 DeepSeek 密钥已包含。可自行添加其他供应商的密钥。':'Built-in DeepSeek key included. Add your own for other providers.'}</p>
          </div>}
          {tab==='agent'&&<div className="ps-section"><h3>{isZh?'代理配置':'Agent Configuration'}</h3>
            <div className="ps-row"><label>{isZh?'代理名称':'Agent Name'}</label><input value={s.agent.name} onChange={e=>dispatch(updateAgentConfig({name:e.target.value}))}/></div>
            <div className="ps-row"><label>{isZh?'推理风格':'Reasoning Style'}</label><select value={s.agent.reasoningStyle} onChange={e=>dispatch(updateAgentConfig({reasoningStyle:e.target.value as any}))}><option value="concise">{isZh?'简洁':'Concise'}</option><option value="detailed">{isZh?'详细':'Detailed'}</option><option value="creative">{isZh?'创意':'Creative'}</option></select></div>
            <div className="ps-row"><label>{isZh?'最大Token数':'Max Tokens'}</label><input type="number" value={s.agent.maxTokens} onChange={e=>dispatch(updateAgentConfig({maxTokens:Number(e.target.value)}))} min={512} max={16384}/></div>
            <div className="ps-row"><label>{isZh?'温度':'Temperature'} ({s.agent.temperature})</label><input type="range" min="0" max="2" step="0.1" value={s.agent.temperature} onChange={e=>dispatch(updateAgentConfig({temperature:Number(e.target.value)}))}/></div>
            <div className="ps-row"><label>{isZh?'自动执行':'Auto-Execute'}</label><input type="checkbox" checked={s.agent.autoExecute} onChange={e=>dispatch(updateAgentConfig({autoExecute:e.target.checked}))}/></div>
          </div>}
          {tab==='plugins'&&<div className="ps-section"><h3>{isZh?'已安装插件':'Installed Plugins'}</h3>
            {s.plugins.map((p:PluginInfo)=><div key={p.id} className="ps-row" style={{justifyContent:'space-between'}}><div><div style={{fontWeight:600,fontSize:13}}>{p.name}</div><div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{p.description}</div></div><div className="ps-toggle" onClick={()=>dispatch(togglePlugin(p.id))}><div className={'ps-toggle-knob'+(p.enabled?' on':'')}/></div></div>)}
            <div style={{marginTop:14,padding:'12px 14px',background:'var(--card)',borderRadius:8,border:'1px dashed var(--border)',textAlign:'center',cursor:'pointer',color:'var(--text3)',fontSize:12}}>{isZh?'+ 从 MCP 注册表安装插件':'+ Install Plugin from MCP Registry'}</div>
          </div>}
          {tab==='connect'&&<div className="ps-section"><h3>{isZh?'手机连接':'Mobile Connection'}</h3>
            <div className="ps-row"><label>{isZh?'启用手机端':'Enable Mobile'}</label><input type="checkbox" checked={s.mobileLink.enabled} onChange={e=>dispatch(updateMobileLink({enabled:e.target.checked}))}/></div>
            {s.mobileLink.enabled&&<div className="ps-card"><p>{isZh?'扫描二维码连接手机设备。即将推出。':'Scan QR code to connect. Coming soon.'}</p></div>}
            <h3 style={{marginTop:20}}>{isZh?'第三方 API':'Third-Party API'}</h3>
            <div className="ps-row"><label>{isZh?'启用 API 访问':'Enable API'}</label><input type="checkbox" checked={s.thirdParty.apiEnabled} onChange={e=>dispatch(updateThirdParty({apiEnabled:e.target.checked}))}/></div>
            {s.thirdParty.apiEnabled&&<><div className="ps-row"><label>{isZh?'API 端口':'API Port'}</label><input type="number" value={s.thirdParty.apiPort} onChange={e=>dispatch(updateThirdParty({apiPort:Number(e.target.value)}))}/></div><div className="ps-row"><label>{isZh?'Webhook URL'}</label><input value={s.thirdParty.webhookUrl} onChange={e=>dispatch(updateThirdParty({webhookUrl:e.target.value}))} placeholder="https://..."/></div></>}
            <h3 style={{marginTop:20}}>{isZh?'代理':'Proxy'}</h3>
            <div className="ps-row"><label>{isZh?'启用代理':'Enable Proxy'}</label><input type="checkbox" checked={s.proxy.enabled} onChange={e=>dispatch(updateProxy({enabled:e.target.checked}))}/></div>
            {s.proxy.enabled&&<><div className="ps-row"><label>{isZh?'主机':'Host'}</label><input value={s.proxy.host} onChange={e=>dispatch(updateProxy({host:e.target.value}))}/></div><div className="ps-row"><label>{isZh?'端口':'Port'}</label><input value={s.proxy.port} onChange={e=>dispatch(updateProxy({port:e.target.value}))}/></div></>}
          </div>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
