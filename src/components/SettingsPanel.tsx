import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, type Theme, type Language } from '../store/chatSlice';

function t(key: string, isZh: boolean): string {
  const map: Record<string, string> = {
    settings: '设置', theme: '主题', dark: '暗色', light: '亮色', language: '语言', font: '字号',
    models: '模型 API 密钥', note: '内置 DeepSeek 密钥已包含。可自行添加其他供应商的密钥。',
    agent: '代理配置', name: '代理名称', style: '推理风格', concise: '简洁', detailed: '详细', creative: '创意',
    tokens: '最大Token数', temp: '温度', auto: '自动执行',
    plugins: '已安装插件', mcp: '+ 从 MCP 注册表安装插件',
    mobile: '手机连接', enableM: '启用手机端', qr: '扫描二维码连接手机设备。即将推出。',
    third: '第三方 API', enableA: '启用 API 访问', port: 'API 端口', webhook: 'Webhook URL',
    proxy: '代理', enableP: '启用代理', host: '主机', pport: '端口',
  };
  return isZh ? (map[key] || key) : key;
}

const SettingsPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const s = useAppSelector(st => st.chat.settings);
  const [tab, setTab] = useState('general');
  const zh = s.language === 'zh-CN';
  const tabs = [{ id:'general',label:'通用',icon:'⚙' },{ id:'models',label:'模型',icon:'▣' },{ id:'agent',label:'代理',icon:'◈' },{ id:'plugins',label:'插件',icon:'⎔' },{ id:'connect',label:'连接',icon:'◎' }];

  return (
    <div className="ps-overlay" onClick={() => dispatch(toggleSettings())}>
      <div className="ps-panel" onClick={e => e.stopPropagation()}>
        <div className="ps-tabs"><div className="ps-tab-header">{t('settings',zh)}</div>
          {tabs.map(tb => <div key={tb.id} className={'ps-tab'+(tab===tb.id?' sel':'')} onClick={()=>setTab(tb.id)}><span className="ps-tab-icon">{tb.icon}</span><span>{tb.label}</span></div>)}
        </div>
        <div className="ps-content">
          {tab==='general' && <div className="ps-section">
            <h3>{t('theme',zh)}</h3>
            <div className="ps-row"><label>{t('theme',zh)}</label><select value={s.theme} onChange={e=>dispatch(setTheme(e.target.value as Theme))}><option value="dark">{t('dark',zh)}</option><option value="light">{t('light',zh)}</option></select></div>
            <div className="ps-row"><label>{t('language',zh)}</label><select value={s.language} onChange={e=>dispatch(setLanguage(e.target.value as Language))}><option value="zh-CN">中文</option><option value="en">English</option></select></div>
            <div className="ps-row"><label>{t('font',zh)} ({s.fontSize}px)</label><input type="range" min="12" max="22" value={s.fontSize} onChange={e=>dispatch(setFontSize(Number(e.target.value)))}/></div>
          </div>}
          {tab==='models' && <div className="ps-section"><h3>{t('models',zh)}</h3>
            {['deepseek','anthropic','openai'].map(p => <div key={p} className="ps-row"><label style={{textTransform:'capitalize'}}>{p}</label><input type="password" value={(s.apiKeys as any)[p]} onChange={e=>dispatch(setApiKey({provider:p,key:e.target.value}))} placeholder="sk-..."/></div>)}
            <p className="ps-note">{t('note',zh)}</p>
          </div>}
          {tab==='agent' && <div className="ps-section"><h3>{t('agent',zh)}</h3>
            <div className="ps-row"><label>{t('name',zh)}</label><input value={s.agent.name} onChange={e=>dispatch(updateAgentConfig({name:e.target.value}))}/></div>
            <div className="ps-row"><label>{t('style',zh)}</label><select value={s.agent.reasoningStyle} onChange={e=>dispatch(updateAgentConfig({reasoningStyle:e.target.value as any}))}><option value="concise">{t('concise',zh)}</option><option value="detailed">{t('detailed',zh)}</option><option value="creative">{t('creative',zh)}</option></select></div>
            <div className="ps-row"><label>{t('tokens',zh)}</label><input type="number" value={s.agent.maxTokens} onChange={e=>dispatch(updateAgentConfig({maxTokens:Number(e.target.value)}))} min={512} max={16384}/></div>
            <div className="ps-row"><label>{t('temp',zh)} ({s.agent.temperature})</label><input type="range" min="0" max="2" step="0.1" value={s.agent.temperature} onChange={e=>dispatch(updateAgentConfig({temperature:Number(e.target.value)}))}/></div>
            <div className="ps-row"><label>{t('auto',zh)}</label><input type="checkbox" checked={s.agent.autoExecute} onChange={e=>dispatch(updateAgentConfig({autoExecute:e.target.checked}))}/></div>
          </div>}
          {tab==='plugins' && <div className="ps-section"><h3>{t('plugins',zh)}</h3>
            {s.plugins.map(p => <div key={p.id} className="ps-row" style={{justifyContent:'space-between'}}><div><div style={{fontWeight:600,fontSize:13}}>{p.name}</div><div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{p.description}</div></div><div className="ps-toggle" onClick={()=>dispatch(togglePlugin(p.id))}><div className={'ps-toggle-knob'+(p.enabled?' on':'')}/></div></div>)}
            <div style={{marginTop:14,padding:'12px 14px',background:'var(--card)',borderRadius:8,border:'1px dashed var(--border)',textAlign:'center',cursor:'pointer',color:'var(--text3)',fontSize:12}}>{t('mcp',zh)}</div>
          </div>}
          {tab==='connect' && <div className="ps-section"><h3>{t('mobile',zh)}</h3>
            <div className="ps-row"><label>{t('enableM',zh)}</label><input type="checkbox" checked={s.mobileLink.enabled} onChange={e=>dispatch(updateMobileLink({enabled:e.target.checked}))}/></div>
            {s.mobileLink.enabled && <div className="ps-card"><p>{t('qr',zh)}</p></div>}
            <h3 style={{marginTop:20}}>{t('third',zh)}</h3>
            <div className="ps-row"><label>{t('enableA',zh)}</label><input type="checkbox" checked={s.thirdParty.apiEnabled} onChange={e=>dispatch(updateThirdParty({apiEnabled:e.target.checked}))}/></div>
            {s.thirdParty.apiEnabled && <div><div className="ps-row"><label>{t('port',zh)}</label><input type="number" value={s.thirdParty.apiPort} onChange={e=>dispatch(updateThirdParty({apiPort:Number(e.target.value)}))}/></div><div className="ps-row"><label>{t('webhook',zh)}</label><input value={s.thirdParty.webhookUrl} onChange={e=>dispatch(updateThirdParty({webhookUrl:e.target.value}))} placeholder="https://..."/></div></div>}
            <h3 style={{marginTop:20}}>{t('proxy',zh)}</h3>
            <div className="ps-row"><label>{t('enableP',zh)}</label><input type="checkbox" checked={s.proxy.enabled} onChange={e=>dispatch(updateProxy({enabled:e.target.checked}))}/></div>
            {s.proxy.enabled && <div><div className="ps-row"><label>{t('host',zh)}</label><input value={s.proxy.host} onChange={e=>dispatch(updateProxy({host:e.target.value}))}/></div><div className="ps-row"><label>{t('pport',zh)}</label><input value={s.proxy.port} onChange={e=>dispatch(updateProxy({port:e.target.value}))}/></div></div>}
          </div>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
