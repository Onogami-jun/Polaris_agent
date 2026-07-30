import React, { useState, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, type Theme, type Language } from '../store/chatSlice';
import { loginUser, logoutUser } from '../store/authSlice';
import { Button } from './ui/button';
import { Input } from './ui/input';

/* ── Icons ── */
const Icons: Record<string, React.ReactNode> = {
  general: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.41 1.41m7.08 7.08l1.41 1.41M3.05 12.95l1.41-1.41m7.08-7.08l1.41-1.41"/></svg>,
  models: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><line x1="4" y1="16" x2="4" y2="13"/><line x1="12" y1="16" x2="12" y2="13"/></svg>,
  agent: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><path d="M3 12c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v2H3v-2z"/></svg>,
  plugins: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2.5 5.5L16 9l-5.5 2.5L8 16l-2.5-4.5L0 9l5.5-2.5z"/></svg>,
  data: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="8" cy="3" rx="7" ry="2"/><path d="M1 3v5c0 1.1 3.1 2 7 2s7-.9 7-2V3"/><path d="M1 8v5c0 1.1 3.1 2 7 2s7-.9 7-2V8"/></svg>,
  account: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>,
  about: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7.5" x2="8" y2="11.5"/><circle cx="8" cy="5" r="0.5" fill="currentColor"/></svg>,
};

/* ── Tab config ── */
const TABS = [
  { id: 'general', label: '通用', icon: Icons.general },
  { id: 'models', label: '模型', icon: Icons.models },
  { id: 'agent', label: '代理', icon: Icons.agent },
  { id: 'plugins', label: '插件', icon: Icons.plugins },
  { id: 'data', label: '数据', icon: Icons.data },
  { id: 'account', label: '账号', icon: Icons.account },
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
  const s = useAppSelector(st => st.chat.settings);
  const auth = useAppSelector(st => st.auth);
  const [tab, setTab] = useState('general');

  // Export helper
  const exportData = () => {
    const data = {
      conversations: useAppSelector.getState ? useAppSelector.getState()?.chat?.sessions?.map((s: any) => ({ name: s.name, messages: s.messages.map((m: any) => ({ role: m.role, content: m.content })), createdAt: s.createdAt })) : [],
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
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">设置</span>
          </div>
          <div className="flex-1 px-2 py-1 space-y-0.5">
            {TABS.map(tb => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ' + (tab === tb.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
              >
                <span className="shrink-0">{tb.icon}</span>
                <span>{tb.label}</span>
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
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">通用</h3>
                <Row label="主题" hint={s.theme === 'dark' ? '深色模式' : '浅色模式'}>
                  <select value={s.theme} onChange={e => dispatch(setTheme(e.target.value as Theme))} className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="light">浅色</option><option value="dark">深色</option>
                  </select>
                </Row>
                <Row label="语言">
                  <select value={s.language} onChange={e => dispatch(setLanguage(e.target.value as Language))} className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="zh-CN">中文</option><option value="en">English</option>
                  </select>
                </Row>
                <Row label="字体大小" hint={`${s.fontSize}px`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">12</span>
                    <input type="range" min="12" max="22" value={s.fontSize} onChange={e => dispatch(setFontSize(Number(e.target.value)))} className="w-28 accent-primary" />
                    <span className="text-xs text-muted-foreground">22</span>
                  </div>
                </Row>
                <Row label="自动执行" hint="Agent 生成计划后自动执行">
                  <Toggle on={s.agent.autoExecute} onClick={() => dispatch(updateAgentConfig({ autoExecute: !s.agent.autoExecute }))} />
                </Row>
                <Row label="上下文记忆" hint="跨对话记住用户偏好">
                  <Toggle on={s.memory.enabled} onClick={() => dispatch(updateAgentConfig({ webSearch: !s.agent.webSearch }))} />
                </Row>
              </div>
            )}

            {/* ── Models ── */}
            {tab === 'models' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">模型 API</h3>
                <p className="text-xs text-muted-foreground -mt-4">内置 DeepSeek 免费密钥已包含。添加你自己的 API Key 以解锁更多模型。</p>
                {[
                  { id: 'deepseek', label: 'DeepSeek', note: 'V3 / R1 模型' },
                  { id: 'anthropic', label: 'Anthropic', note: 'Claude Sonnet / Opus' },
                  { id: 'openai', label: 'OpenAI', note: 'GPT-4o / o1' },
                  { id: 'serper', label: 'Serper', note: '联网搜索 API' },
                ].map(p => (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{p.note}</span>
                    </div>
                    <Input
                      type="password"
                      value={(s.apiKeys as any)[p.id]}
                      onChange={e => dispatch(setApiKey({ provider: p.id, key: e.target.value }))}
                      placeholder={p.id === 'deepseek' ? '已内置 · 可覆盖' : 'sk-...'}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── Agent ── */}
            {tab === 'agent' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">代理配置</h3>
                <Row label="代理名称" hint="显示给用户的名字">
                  <Input value={s.agent.name} onChange={e => dispatch(updateAgentConfig({ name: e.target.value }))} className="h-9 w-40 text-sm" />
                </Row>
                <Row label="系统提示词" hint="定义 Agent 的行为风格">
                  <textarea value={s.agent.systemPrompt} onChange={e => dispatch(updateAgentConfig({ systemPrompt: e.target.value }))} className="w-64 h-20 rounded-lg border border-border bg-muted p-3 text-xs outline-none focus:ring-2 focus:ring-ring resize-y" />
                </Row>
                <Row label="推理风格">
                  <select value={s.agent.reasoningStyle} onChange={e => dispatch(updateAgentConfig({ reasoningStyle: e.target.value as any }))} className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="concise">简洁</option><option value="detailed">详细</option><option value="creative">创意</option>
                  </select>
                </Row>
                <Row label="最大 Token" hint={`${s.agent.maxTokens}`}>
                  <input type="number" value={s.agent.maxTokens} onChange={e => dispatch(updateAgentConfig({ maxTokens: Number(e.target.value) }))} min={512} max={16384} className="w-24 rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </Row>
                <Row label="温度" hint={`${s.agent.temperature}`}>
                  <input type="range" min="0" max="2" step="0.1" value={s.agent.temperature} onChange={e => dispatch(updateAgentConfig({ temperature: Number(e.target.value) }))} className="w-28 accent-primary" />
                </Row>
              </div>
            )}

            {/* ── Plugins ── */}
            {tab === 'plugins' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">已安装插件</h3>
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
                  <span className="text-xs text-muted-foreground">+ 从 MCP 注册表安装插件</span>
                </div>
              </div>
            )}

            {/* ── Data & Export ── */}
            {tab === 'data' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">数据与导出</h3>
                <Row label="导出对话" hint="将所有对话导出为 JSON 文件">
                  <Button variant="outline" size="sm" onClick={exportData}>导出 JSON</Button>
                </Row>
                <Row label="导出当前对话" hint="导出当前会话为 Markdown">
                  <Button variant="outline" size="sm" onClick={() => {
                    const act = (window as any).__polaris_current_session__;
                    const md = act?.messages?.map((m: any) => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}\n`).join('\n---\n') || '';
                    const blob = new Blob([md], { type: 'text/markdown' });
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'polaris-export.md'; a.click();
                  }}>导出 Markdown</Button>
                </Row>
                <Row label="同步设置" hint="登录 BitWool 后自动同步">
                  <span className="text-xs text-muted-foreground">{auth.user ? '已登录 · 云端同步已启用' : '未登录 · 仅本地存储'}</span>
                </Row>
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-destructive mb-3">危险区域</h4>
                  <Row label="清除所有数据" hint="删除所有对话和本地设置">
                    <Button variant="destructive" size="sm" onClick={resetAll}>重置</Button>
                  </Row>
                </div>
              </div>
            )}

            {/* ── Account ── */}
            {tab === 'account' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">BitWool 账号</h3>
                {auth.user ? (
                  <>
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white" style={{ background: auth.user.avatar }}>
                        {auth.user.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">{auth.user.displayName}</div>
                        <div className="text-xs text-muted-foreground">{auth.user.email}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono">计划: {auth.user.plan} · ID: {auth.user.id?.slice(0, 12)}…</div>
                      </div>
                    </div>
                    <Row label="创建时间" hint={auth.user.createdAt ? new Date(auth.user.createdAt).toLocaleDateString('zh-CN') : '-'}>
                      <span className="text-sm text-muted-foreground">{auth.user.createdAt ? new Date(auth.user.createdAt).toLocaleDateString('zh-CN') : '-'}</span>
                    </Row>
                    <div className="pt-2">
                      <Button variant="outline" className="w-full" onClick={() => dispatch(logoutUser())}>退出登录</Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                        <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">登录 BitWool 账号以启用云端同步</p>
                    <div className="flex flex-col gap-2 max-w-[240px] mx-auto">
                      <Input placeholder="邮箱" className="h-9 text-sm" id="login-email" />
                      <Input type="password" placeholder="密码" className="h-9 text-sm" id="login-pwd" />
                      <Button size="sm" onClick={() => {
                        const email = (document.getElementById('login-email') as HTMLInputElement)?.value;
                        const pwd = (document.getElementById('login-pwd') as HTMLInputElement)?.value;
                        if (email && pwd) dispatch(loginUser({ email, password: pwd }));
                      }}>登录</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── About ── */}
            {tab === 'about' && (
              <div className="space-y-6">
                <h3 className="text-base font-semibold text-foreground pb-3 border-b border-border">关于 Polaris Solver</h3>
                <div className="text-center py-4 space-y-3">
                  <div className="text-3xl font-bold font-mono text-primary">POLARIS</div>
                  <div className="text-sm text-muted-foreground">运筹优化科研助手 · v3.0</div>
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
                  <Row label="作者" hint="BitWool Studio">
                    <a href="https://bitwool.cn" target="_blank" rel="noopener" className="text-sm text-primary hover:underline">bitwool.cn</a>
                  </Row>
                  <Row label="邮箱" hint="联系我们">
                    <span className="text-sm text-muted-foreground font-mono">bitwool@163.com</span>
                  </Row>
                  <Row label="许可证">
                    <span className="text-sm text-muted-foreground">MIT License</span>
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

export default SettingsPanel;
