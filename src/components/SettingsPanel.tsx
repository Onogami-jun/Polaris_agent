import React, { useState, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, setMascotSettings, type Theme, type Language } from '../store/chatSlice';
import { loginUser, logoutUser } from '../store/authSlice';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { t } from '../i18n';
import MCPSettings from './MCPSettings';

/* ── i18n labels ── */
const LANG_LABELS: Record<Language, string> = {
  'zh-CN': '中文（简体）', 'en': 'English', 'ja': '日本語', 'fr': 'Français',
};
function langLabel(lang: Language): string { return LANG_LABELS[lang] || lang; }

/* ── Icons ── */
const Icons: Record<string, React.ReactNode> = {
  general: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.41 1.41m7.08 7.08l1.41 1.41M3.05 12.95l1.41-1.41m7.08-7.08l1.41-1.41"/></svg>,
  models: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><line x1="4" y1="16" x2="4" y2="13"/><line x1="12" y1="16" x2="12" y2="13"/></svg>,
  agent: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><path d="M3 12c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v2H3v-2z"/></svg>,
  plugins: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2.5 5.5L16 9l-5.5 2.5L8 16l-2.5-4.5L0 9l5.5-2.5z"/></svg>,
  data: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="8" cy="3" rx="7" ry="2"/><path d="M1 3v5c0 1.1 3.1 2 7 2s7-.9 7-2V3"/><path d="M1 8v5c0 1.1 3.1 2 7 2s7-.9 7-2V8"/></svg>,
  account: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>,
  sandbox: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="5" width="14" height="8" rx="1.5"/><path d="M5 5V3a2 2 0 012-2h2a2 2 0 012 2v2"/><line x1="5" y1="9" x2="11" y2="9"/><line x1="5" y1="11" x2="7" y2="11"/></svg>,
  lab: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2v6l-3 4h12l-3-4V2"/><line x1="8" y1="11" x2="8" y2="14"/><line x1="3" y1="12" x2="13" y2="12"/></svg>,
  about: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7.5" x2="8" y2="11.5"/><circle cx="8" cy="5" r="0.5" fill="currentColor"/></svg>,
  security: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5l5 2v4.5c0 3.5-2.2 5.9-5 7-2.8-1.1-5-3.5-5-7V3.5l5-2z"/><path d="M6 8l1.5 1.5L10 7"/></svg>,
};

/* ── Tab config ── */
const TABS = [
  { id: 'general', label: '通用', icon: Icons.general },
  { id: 'models', label: '模型', icon: Icons.models },
  { id: 'agent', label: '代理', icon: Icons.agent },
  { id: 'plugins', label: '插件', icon: Icons.plugins },
  { id: 'data', label: '数据', icon: Icons.data },
  { id: 'account', label: '账号', icon: Icons.account },
  { id: 'sandbox', label: '沙箱', icon: Icons.sandbox },
  { id: 'security', label: '安全', icon: Icons.security },
  { id: 'about', label: '关于', icon: Icons.about },
];

/* ── Shared form components ── */
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 gap-4">
      <div className="shrink-0">
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={'w-10 h-5 rounded-full cursor-pointer transition-colors relative ' + (on ? 'bg-primary' : 'bg-muted-foreground/20')}>
      <div className={'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ' + (on ? 'left-[22px]' : 'left-0.5')} />
    </div>
  );
}

/* ── Main Panel ── */
const SettingsPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const chat = useAppSelector(st => st.chat);
  const s = chat.settings;
  const auth = useAppSelector(st => st.auth);
  const [tab, setTab] = useState('general');
  const [version, setVersion] = useState('4.0');

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getVersion) api.getVersion().then((v: any) => { if (v) setVersion(v); }).catch(() => {});
  }, []);

  const exportData = () => {
    const activeSession = chat.sessions.find(x => x.id === chat.activeSessionId);
    const data = {
      conversations: chat.sessions.map((x: any) => ({ name: x.name, messages: x.messages.map((m: any) => ({ role: m.role, content: m.content })), createdAt: x.createdAt })),
      activeSessionId: chat.activeSessionId,
      settings: s,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `polaris-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  // Reset
  const resetAll = () => {
    if (confirm('确定要清除所有对话和设置吗？此操作不可撤销。')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={() => dispatch(toggleSettings())}>
      <div className="flex w-[720px] max-w-[94vw] h-[520px] max-h-[85vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* ── Sidebar ── */}
        <div className="w-[180px] shrink-0 bg-muted/50 border-r border-border flex flex-col">
          <div className="px-4 pt-5 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t(s.language,'sidebar.settings')}</span>
          </div>
          <div className="flex-1 px-2 py-1 space-y-0.5">
            {TABS.map(tb => (
              <button
                key={tb.id}
                data-tab={tb.id}
                onClick={() => setTab(tb.id)}
                className={'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ' + (tab === tb.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
              >
                <span className="shrink-0">{tb.icon}</span>
                <span>{t(s.language,'settings.tabs.'+tb.id)}</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-3 border-t border-border">
            <p className="text-[9px] text-muted-foreground font-mono">Polaris Solver v3.0</p>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">

            {/* ── General ── */}
            {tab === 'general' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.general.title')}</h3>
                <Row label={t(s.language,'settings.general.theme')} hint={s.theme==='dark'?t(s.language,'settings.general.themeHint2'):t(s.language,'settings.general.themeHint1')}>
                  <select value={s.theme} onChange={e => dispatch(setTheme(e.target.value as Theme))} className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="light">{t(s.language,'settings.general.themeLight')}</option><option value="dark">{t(s.language,'settings.general.themeDark')}</option>
                  </select>
                </Row>
                <Row label={t(s.language,'settings.general.language')} hint={langLabel(s.language)}>
                  <select value={s.language} onChange={e => dispatch(setLanguage(e.target.value as Language))} className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="zh-CN">中文 (简体)</option><option value="en">English</option><option value="ja">日本語</option><option value="fr">Français</option>
                  </select>
                </Row>
                <Row label={t(s.language,'settings.general.fontSize')} hint={`${s.fontSize}px`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">12</span>
                    <input type="range" min="12" max="22" value={s.fontSize} onChange={e => dispatch(setFontSize(Number(e.target.value)))} className="w-28 accent-primary" />
                    <span className="text-xs text-muted-foreground font-mono w-6 text-center font-semibold text-foreground">{s.fontSize}</span>
                    <span className="text-xs text-muted-foreground">22</span>
                  </div>
                </Row>
                <Row label={t(s.language,'settings.general.autoExecute')} hint={t(s.language,'settings.general.autoExecuteHint')}>
                  <Toggle on={s.agent.autoExecute} onClick={() => dispatch(updateAgentConfig({ autoExecute: !s.agent.autoExecute }))} />
                </Row>
                <Row label={t(s.language,'settings.general.contextMemory')} hint={t(s.language,'settings.general.contextMemoryHint')}>
                  <Toggle on={s.memory.enabled} onClick={() => dispatch(updateAgentConfig({ webSearch: !s.agent.webSearch }))} />
                </Row>
                <Row label={t(s.language,'settings.general.showGuide')} hint={t(s.language,'settings.general.showGuideHint')}>
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => {localStorage.removeItem('polaris_onboarding_done');try{localStorage.setItem('ps_set',JSON.stringify(s));}catch(e){}window.location.reload()}}>{t(s.language,'settings.general.showGuideBtn')}</Button>
                </Row>
                <Row label="系统通知" hint="发送一条测试通知">
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => { const api = (window as any).electronAPI; if (api?.notify) api.notify({ title: 'Polaris Solver', body: '这是一条测试通知 ✓' }); }}>测试通知</Button>
                </Row>
                <div className="pt-4 border-t border-border mt-4">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Pola</h4>
                  <Row label={t(s.language,'settings.general.mascotShow')} hint={t(s.language,'settings.general.mascotShowHint')}>
                    <Toggle on={s.mascot.enabled} onClick={() => dispatch(setMascotSettings({ enabled: !s.mascot.enabled }))} /></Row>
                  <Row label={t(s.language,'settings.general.mascotClick')} hint={t(s.language,'settings.general.mascotClickHint')}>
                    <Toggle on={s.mascot.clickReactions} onClick={() => dispatch(setMascotSettings({ clickReactions: !s.mascot.clickReactions }))} /></Row>
                  <Row label={t(s.language,'settings.general.mascotWander')} hint={t(s.language,'settings.general.mascotWanderHint')}>
                    <Toggle on={s.mascot.autoWander} onClick={() => dispatch(setMascotSettings({ autoWander: !s.mascot.autoWander }))} /></Row>
                  <Row label={t(s.language,'settings.general.mascotSleepy')} hint={t(s.language,'settings.general.mascotSleepyHint')}>
                    <Toggle on={s.mascot.showWhenSleepy} onClick={() => dispatch(setMascotSettings({ showWhenSleepy: !s.mascot.showWhenSleepy }))} /></Row>
                </div>
              </div>
            )}

            {/* ── Models ── */}
            {tab === 'models' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.models.title')}</h3>
                <p className="text-xs text-muted-foreground -mt-4">{t(s.language,'settings.models.desc')}</p>

                {/* ── Local Model ── */}
                <LocalModelSection lang={s.language} />

                {[
                  { id: 'deepseek', label: 'DeepSeek', noteK: 'deepseekNote' },
                  { id: 'anthropic', label: 'Anthropic', noteK: 'anthropicNote' },
                  { id: 'openai', label: 'OpenAI', noteK: 'openaiNote' },
                  { id: 'serper', label: 'Serper', noteK: 'serperNote' },
                  { id: 'github', label: 'GitHub', noteK: 'githubNote' },
                  { id: 'doubao', label: '豆包（视觉）', noteK: 'doubaoNote' },
                ].map(p => (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{t(s.language,'settings.models.'+p.noteK)}</span>
                    </div>
                    <Input type="password" value={(s.apiKeys as any)[p.id]} onChange={e => dispatch(setApiKey({ provider: p.id, key: e.target.value }))} placeholder={p.id==='deepseek'?t(s.language,'settings.models.deepseekPlaceholder'):p.id==='doubao'?'Ark API Key (火山引擎)':p.id==='github'?'ghp_...':'sk-...'} className="h-9 text-xs font-mono"/>
                  </div>
                ))}
              </div>
            )}

            {/* ── Agent ── */}
            {tab === 'agent' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.agent.title')}</h3>
                <Row label={t(s.language,'settings.agent.name')} hint={t(s.language,'settings.agent.nameHint')}>
                  <Input value={s.agent.name} onChange={e => dispatch(updateAgentConfig({ name: e.target.value }))} className="h-9 w-40 text-sm" />
                </Row>
                <Row label={t(s.language,'settings.agent.systemPrompt')} hint={t(s.language,'settings.agent.systemPromptHint')}>
                  <textarea value={s.agent.systemPrompt} onChange={e => dispatch(updateAgentConfig({ systemPrompt: e.target.value }))} className="w-64 h-20 rounded-lg border border-border bg-muted p-3 text-xs outline-none focus:ring-2 focus:ring-ring resize-y" />
                </Row>
                <Row label={t(s.language,'settings.agent.reasoningStyle')}>
                  <select value={s.agent.reasoningStyle} onChange={e => dispatch(updateAgentConfig({ reasoningStyle: e.target.value as any }))} className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="concise">{t(s.language,'settings.agent.concise')}</option><option value="detailed">{t(s.language,'settings.agent.detailed')}</option><option value="creative">{t(s.language,'settings.agent.creative')}</option>
                  </select>
                </Row>
                <Row label={t(s.language,'settings.agent.maxTokens')} hint={`${s.agent.maxTokens}`}>
                  <input type="number" value={s.agent.maxTokens} onChange={e => dispatch(updateAgentConfig({ maxTokens: Number(e.target.value) }))} min={512} max={16384} className="w-24 rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </Row>
                <Row label={t(s.language,'settings.agent.temperature')} hint={`${s.agent.temperature}`}>
                  <input type="range" min="0" max="2" step="0.1" value={s.agent.temperature} onChange={e => dispatch(updateAgentConfig({ temperature: Number(e.target.value) }))} className="w-28 accent-primary" />
                </Row>
              </div>
            )}

            {/* ── Plugins ── */}
            {tab === 'plugins' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.plugins.title')}</h3>
                {s.plugins.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-3 px-4 rounded-xl border border-border/50 bg-muted/30">
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{p.description}</div>
                    </div>
                    <Toggle on={p.enabled} onClick={() => dispatch(togglePlugin(p.id))} />
                  </div>
                ))}
                <div className="flex items-center justify-center py-5 rounded-xl border-2 border-dashed border-border/50 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
                  <span className="text-xs text-muted-foreground">{t(s.language,'settings.plugins.empty')}</span>
                </div>
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3">MCP 服务器</h4>
                  <MCPSettings />
                </div>
              </div>
            )}

            {/* ── Data & Export ── */}
            {tab === 'data' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.data.title')}</h3>
                <Row label={t(s.language,'settings.data.exportJson')} hint={t(s.language,'settings.data.exportJsonHint')}>
                  <Button variant="outline" size="sm" onClick={exportData}>{t(s.language,'settings.data.exportJsonBtn')}</Button>
                </Row>
                <Row label={t(s.language,'settings.data.exportMd')} hint={t(s.language,'settings.data.exportMdHint')}>
                  <Button variant="outline" size="sm" onClick={() => {
                    const act = chat.sessions.find(x => x.id === chat.activeSessionId);
                    const md = act ? act.messages.map((m: any) => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}\n`).join('\n---\n') : '';
                    const blob = new Blob([md], { type: 'text/markdown' });
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'polaris-export.md'; a.click();
                  }}>{t(s.language,'settings.data.exportMdBtn')}</Button>
                </Row>
                <Row label={t(s.language,'settings.data.sync')} hint={t(s.language,'settings.data.syncHint')}>
                  <span className="text-xs text-muted-foreground">{auth.user ? t(s.language,'settings.data.syncLogged') : t(s.language,'settings.data.syncUnlogged')}</span>
                </Row>
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-destructive mb-3">{t(s.language,'settings.data.dangerTitle')}</h4>
                  <Row label={t(s.language,'settings.data.reset')} hint={t(s.language,'settings.data.resetHint')}>
                    <Button variant="destructive" size="sm" onClick={resetAll}>{t(s.language,'settings.data.resetBtn')}</Button>
                  </Row>
                </div>
              </div>
            )}

            {/* ── Account ── */}
            {tab === 'account' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.account.title')}</h3>
                {auth.user ? (
                  <div className="contents">
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white" style={{ background: auth.user.avatar }}>
                        {auth.user.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">{auth.user.displayName}</div>
                        <div className="text-xs text-muted-foreground">{auth.user.email}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono">{t(s.language,'settings.account.plan')}: {auth.user.plan} · ID: {auth.user.id?.slice(0, 12)}…</div>
                      </div>
                    </div>
                    <Row label={t(s.language,'settings.account.createdAt')} hint={auth.user.createdAt ? new Date(auth.user.createdAt).toLocaleDateString('zh-CN') : '-'}>
                      <span className="text-sm text-muted-foreground">{auth.user.createdAt ? new Date(auth.user.createdAt).toLocaleDateString('zh-CN') : '-'}</span>
                    </Row>
                    <div className="pt-2">
                      <Button variant="outline" className="w-full" onClick={() => dispatch(logoutUser())}>{t(s.language,'settings.account.logout')}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                        <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">{t(s.language,'settings.account.loginTitle')}</p>
                    <div className="flex flex-col gap-2 max-w-[240px] mx-auto">
                      <Input placeholder={t(s.language,'settings.account.email')} className="h-9 text-sm" id="login-email" />
                      <Input type="password" placeholder={t(s.language,'settings.account.password')} className="h-9 text-sm" id="login-pwd" />
                      <Button size="sm" onClick={() => {
                        const email = (document.getElementById('login-email') as HTMLInputElement)?.value;
                        const pwd = (document.getElementById('login-pwd') as HTMLInputElement)?.value;
                        if (email && pwd) dispatch(loginUser({ email, password: pwd }));
                      }}>{t(s.language,'settings.account.loginBtn')}</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sandbox ── */}
            {tab === 'sandbox' && <SandboxSettings />}

            {/* ── Security ── */}
            {tab === 'security' && <SecuritySection />}

            {/* ── About ── */}
            {tab === 'about' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.about.title')}</h3>
                <div className="text-center py-4 space-y-3">
                  <div className="text-3xl font-bold font-mono text-primary">POLARIS</div>
                  <div className="text-sm text-muted-foreground">{t(s.language,'settings.about.subtitle')} · v{version}</div>
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-mono">Electron 31</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-mono">React 18</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-mono">TypeScript</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-mono">shadcn/ui</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-mono">DeepSeek</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground font-mono">HiGHS</span>
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <Row label={t(s.language,'settings.about.author')} hint={t(s.language,'settings.about.authorVal')}>
                    <a href="https://bitwool.cn" target="_blank" rel="noopener" className="text-sm text-primary hover:underline">bitwool.cn</a>
                  </Row>
                  <Row label={t(s.language,'settings.about.email')} hint="bitwool@163.com">
                    <span className="text-sm text-muted-foreground font-mono">bitwool@163.com</span>
                  </Row>
                  <Row label={t(s.language,'settings.about.license')}>
                    <span className="text-sm text-muted-foreground">{t(s.language,'settings.about.licenseVal')}</span>
                  </Row>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Security Settings Tab (密钥保险库) ── */
const VAULT_NAME_LABELS: Record<string, string> = {
  deepseek_api_key: 'DeepSeek API 密钥',
  supabase_service_role: 'Supabase Service Role',
  smtp_password: 'SMTP 邮件密码',
  github_client_secret: 'GitHub OAuth Secret',
};

function SecuritySection() {
  const s = useAppSelector(st => st.chat.settings);
  const [vault, setVault] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);

  const refresh = () => {
    const api = (window as any).electronAPI;
    if (!api) return;
    api.securityVaultStatus?.().then((v: any) => setVault(v)).catch(() => {});
    api.securityAuditLog?.().then((a: any) => setAudit(Array.isArray(a) ? a : [])).catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  const entries: any[] = vault?.entries || [];
  const configuredCount = entries.filter((e: any) => e.configured).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border flex-1">安全设置</h3>
        <Button variant="outline" size="sm" className="h-7 text-[10px] ml-3" onClick={refresh}>刷新</Button>
      </div>

      {/* ── 保险库状态 ── */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔐</span>
          <div>
            <h4 className="text-sm font-semibold text-foreground">加密保险库</h4>
            <p className="text-[10px] text-muted-foreground font-mono">{vault?.cipher || 'AES-256-GCM'} · {configuredCount}/{entries.length || 4} 已配置 · 会话{vault?.sessionActive ? '已鉴权' : '未鉴权'}</p>
          </div>
        </div>
        <div className="space-y-1">
          {entries.length > 0 ? entries.map((e: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
              <span className={e.configured ? 'text-emerald-500 text-xs' : 'text-muted-foreground/40 text-xs'}>{e.configured ? '✓' : '✗'}</span>
              <span className="flex-1 text-xs font-mono text-muted-foreground">{VAULT_NAME_LABELS[e.name] || e.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{e.name}</span>
              <span className={'text-[10px] font-semibold ' + (e.configured ? 'text-emerald-500' : 'text-red-400')}>{e.configured ? '已加密存储' : '未配置'}</span>
            </div>
          )) : (
            <p className="text-xs text-muted-foreground">保险库未加载</p>
          )}
        </div>
      </div>

      {/* ── 审计日志 ── */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">审计日志</h4>
        <p className="text-[10px] text-muted-foreground -mt-1 mb-3">登录、鉴权、文件操作与系统命令的实时记录</p>
        {audit.length > 0 ? (
          <div className="rounded-xl bg-muted/20 border border-border/50 p-3 font-mono text-[11px] text-muted-foreground space-y-1 max-h-[240px] overflow-y-auto">
            {audit.slice().reverse().map((l: any, i: number) => (
              <div key={i} className="flex gap-2 hover:text-foreground transition-colors">
                <span className="text-muted-foreground/50 shrink-0">[{l.ts ? new Date(l.ts).toLocaleTimeString() : '--:--:--'}]</span>
                <span className="text-amber-400 shrink-0">[{l.category}/{l.action}]</span>
                <span className="truncate">{l.detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">暂无审计记录 — 登录或执行文件操作后自动产生</p>
        )}
      </div>
    </div>
  );
}

/* ── Sandbox Settings Tab ── */
function SandboxSettings() {
  const s = useAppSelector(st => st.chat.settings);
  const [ready, setReady] = useState(false);
  const [polarisOk, setPolarisOk] = useState(false);
  const [pythonVer, setPythonVer] = useState('');
  const [progress, setProgress] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    const api = window.electronAPI;
    if (!api) return;
    api.sandboxReady().then((r: any) => setReady(r)).catch(() => {});
    api.sandboxHasPolaris().then((r: any) => setPolarisOk(r)).catch(() => {});
    api.sandboxHealth().then((h: any) => { if (h?.pythonVersion) setPythonVer(h.pythonVersion); }).catch(() => {});
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);

  const doSetup = () => {
    const api = window.electronAPI;
    if (!api) return;
    setInstalling(true); setError('');
    api.onSandboxProgress((d: any) => {
      setProgress(d);
      if (d.phase === 'done') {
        setInstalling(false);
        refresh();
      }
      if (d.phase === 'error') {
        setInstalling(false);
        setError(d.message || '安装失败');
      }
    });
    api.sandboxSetup().then((r: any) => {
      if (r?.success) refresh();
      else { setInstalling(false); setError(r?.error || '安装失败'); }
    }).catch((e: any) => { setInstalling(false); setError(e.message); });
  };

  const doRepair = () => {
    setInstalling(true); setError('');
    const api = window.electronAPI;
    if (!api) return;
    api.onSandboxProgress((d: any) => {
      setProgress(d);
      if (d.phase === 'done') { setInstalling(false); refresh(); }
    });
    api.sandboxRepair().then(() => { setInstalling(false); refresh(); }).catch((e: any) => {
      setInstalling(false); setError(e.message);
    });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">{t(s.language,'settings.sandbox.title')}</h3>
      <p className="text-xs text-muted-foreground -mt-4">{t(s.language,'settings.sandbox.desc')}</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Python 3.11', ok: ready, detail: pythonVer || (ready ? t(s.language,'settings.sandbox.ready') : t(s.language,'settings.sandbox.notReady')) },
          { label: 'polaris-opt', ok: polarisOk, detail: polarisOk ? t(s.language,'settings.sandbox.installed') : t(s.language,'settings.sandbox.notInstalled') },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30">
            <span className={item.ok ? 'text-emerald-500 text-sm' : 'text-muted-foreground/40 text-sm'}>{item.ok ? '✓' : '✗'}</span>
            <div>
              <div className="text-xs font-medium text-foreground">{item.label}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!ready ? (
          <Button onClick={doSetup} disabled={installing} className="flex-1 h-9">
            {installing ? t(s.language,'settings.sandbox.installing') : t(s.language,'settings.sandbox.installBtn')}
          </Button>
        ) : (
          <Button variant="outline" onClick={doRepair} disabled={installing} className="flex-1 h-9">
            {installing ? t(s.language,'settings.sandbox.repairing') : t(s.language,'settings.sandbox.repairBtn')}
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-xs text-destructive">{error}</div>
      )}

      {/* Progress */}
      {installing && progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>{progress.phase || '安装中'}</span>
            <span>{progress.percent || 0}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress.percent || 0}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{progress.message}</p>
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl bg-muted/30 border border-border/50 p-4 text-xs text-muted-foreground space-y-1">
        <p>{t(s.language,'settings.sandbox.info1')} <span className="font-mono text-[10px]">AppData/Roaming/polaris-agent/sandbox/</span></p>
        <p>{t(s.language,'settings.sandbox.info2')} <span className="font-mono text-[10px]">Documents/GitHub/polaris/</span></p>
        <p>{t(s.language,'settings.sandbox.info3')}</p>
      </div>
    </div>
  );
}

/* ── Local Model Install Section ── */
function fmtSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function LocalModelSection({ lang }: { lang: string }) {
  const [status, setStatus] = useState<'idle'|'checking'|'installing'|'done'|'error'>('idle');
  const [msg, setMsg] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);

  const refreshModels = () => {
    const api = (window as any).electronAPI;
    if (!api?.polarisModelList) return;
    api.polarisModelList().then((r: any) => setModels(r?.models || [])).catch(() => {});
  };

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.polarisServeStatus) return;
    setStatus('checking');
    api.polarisServeStatus().then((s: any) => {
      setRunning(!!s?.running);
      if (s?.running) setStatus('done');
      else if (s?.modelInstalled) { setStatus('done'); setMsg('已安装，推理服务未启动'); }
      else setStatus('idle');
    }).catch(() => setStatus('idle'));
    refreshModels();
  }, []);

  const install = async () => {
    setStatus('installing');
    setMsg('准备下载...');
    setProgress({ phase: 'manifest', percent: 0, message: '准备下载...' });
    try {
      const api = (window as any).electronAPI;
      if (!api?.polarisModelInstall) { setStatus('error'); setMsg('IPC not available'); return; }
      api.onModelInstallProgress?.((d: any) => {
        setProgress(d);
        if (d?.phase === 'done') { setStatus('done'); setMsg('安装完成！请重启 Polaris 激活。'); refreshModels(); }
        else if (d?.phase === 'error') { setStatus('error'); setMsg(d.message || '安装失败'); }
        else if (d?.message) setMsg(d.message);
      });
      const r = await api.polarisModelInstall();
      if (r?.success) {
        setStatus('done');
        setMsg(r.alreadyInstalled ? '已安装' : '安装完成！请重启 Polaris 激活。');
        refreshModels();
      } else {
        setStatus('error');
        setMsg(r?.error || '安装失败');
      }
    } catch (e: any) {
      setStatus('error');
      setMsg(e.message);
    }
  };

  const labels: any = {
    'zh-CN': { title:'本地推理模型', desc:'Polaris 内置轻量模型，安装后离线求解，零 API 费用', install:'安装模型', installing:'下载中...', done:'已安装', runningStatus:'运行中', notRunning:'未启动', check:'检查中...', err:'安装失败', modelList:'本地模型列表', modelEmpty:'暂无本地模型 — 点击上方「安装模型」' },
    'en':     { title:'Local Inference Model', desc:'Built-in lightweight model for offline solving, zero API cost', install:'Install Model', installing:'Installing...', done:'Installed', runningStatus:'Running', notRunning:'Not running', check:'Checking...', err:'Failed', modelList:'Local Models', modelEmpty:'No local model — click "Install Model" above' },
    'ja':     { title:'ローカル推論モデル', desc:'軽量モデルでオフライン解決', install:'インストール', installing:'インストール中...', done:'完了', runningStatus:'実行中', notRunning:'停止', check:'確認中...', err:'失敗', modelList:'ローカルモデル', modelEmpty:'モデルなし' },
    'fr':     { title:'Modele local', desc:'Modele leger integre pour resolution hors ligne', install:'Installer', installing:'Installation...', done:'Installe', runningStatus:'En cours', notRunning:'Arrete', check:'Verification...', err:'Echec', modelList:'Modeles locaux', modelEmpty:'Aucun modele local' },
  };
  const L = labels[lang] || labels['zh-CN'];

  return (
    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🧠</span>
        <div>
          <h4 className="text-sm font-semibold text-foreground">{L.title}</h4>
          <p className="text-[10px] text-muted-foreground">{L.desc}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={'w-2 h-2 rounded-full ' + (running ? 'bg-emerald-500' : status === 'checking' ? 'bg-amber-400' : 'bg-muted-foreground/30')} />
        <span className="text-[10px] text-muted-foreground font-mono">
          {status === 'checking' ? L.check : running ? L.runningStatus : status === 'done' ? L.done : L.notRunning}
        </span>
      </div>

      {/* ── 安装进度条 ── */}
      {status === 'installing' && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>{progress.message || progress.phase || '安装中'}</span>
            <span className="font-semibold text-foreground">{progress.percent || 0}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress.percent || 0}%` }} />
          </div>
        </div>
      )}

      {status === 'error' && <p className="text-[10px] text-destructive">{L.err}: {msg}</p>}
      {status === 'done' && !running && <p className="text-[10px] text-emerald-500">{msg}</p>}

      {status !== 'done' && status !== 'checking' && !running && (
        <Button size="sm" onClick={install} disabled={status === 'installing'}
          className="w-full h-8 text-xs font-semibold">
          {status === 'installing' ? '⏳ ' + L.installing : L.install}
        </Button>
      )}
      {status === 'done' && !running && (
        <p className="text-[10px] text-amber-400 font-medium">⚠ 已安装，但推理服务未启动。请重启 App 激活。</p>
      )}

      {/* ── 本地模型列表 ── */}
      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-[11px] font-semibold text-foreground">{L.modelList}</h5>
          <button onClick={refreshModels} className="text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors">↻</button>
        </div>
        {models.length > 0 ? (
          <div className="space-y-1">
            {models.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
                <span className="text-emerald-500 text-xs">🧠</span>
                <span className="flex-1 text-xs font-mono text-foreground truncate">{m.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{fmtSize(m.size)}</span>
                <span className="text-[9px] font-mono text-muted-foreground/60">{m.location}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground text-center py-2">{L.modelEmpty}</p>
        )}
      </div>
    </div>
  );
}

export default SettingsPanel;
