import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; model?: string; timestamp: number; routing?: { intent: string; models: string[]; rationale: string }; }
export interface ChatSession { id: string; name: string; messages: ChatMessage[]; createdAt: number; }
export type Strategy = 'best_quality' | 'cost_optimized' | 'ensemble';
export type Theme = 'dark' | 'light';
export type Language = 'en' | 'zh-CN';

interface AgentConfig { name: string; systemPrompt: string; maxTokens: number; temperature: number; reasoningStyle: 'concise' | 'detailed' | 'creative'; autoExecute: boolean; }
export interface PluginInfo { id: string; name: string; description: string; enabled: boolean; type: 'mcp_server' | 'tool' | 'skill'; config?: Record<string, string>; }

interface SettingsState {
  apiKeys: { deepseek: string; anthropic: string; openai: string };
  theme: Theme; language: Language; fontSize: number;
  mobileLink: { enabled: boolean; qrCode: string; deviceName: string };
  thirdParty: { apiEnabled: boolean; apiPort: number; webhookUrl: string };
  proxy: { enabled: boolean; host: string; port: string; auth: string };
  agent: AgentConfig; plugins: PluginInfo[];
}

interface ChatState {
  sessions: ChatSession[]; activeSessionId: string | null;
  streaming: boolean; strategy: Strategy;
  sidebarOpen: boolean; settingsOpen: boolean; settings: SettingsState;
}

const defaultAgent: AgentConfig = {
  name: 'Polaris',
  systemPrompt: '你是Polaris，一个桌面AI助手。你可以控制应用程序、管理文件、并帮助用户完成任何任务。用中文回复。',
  maxTokens: 4096, temperature: 0.7, reasoningStyle: 'detailed', autoExecute: false,
};

const initialState: ChatState = {
  sessions: [{ id: 'default', name: '新对话', messages: [], createdAt: Date.now() }],
  activeSessionId: 'default', streaming: false, strategy: 'best_quality', sidebarOpen: true, settingsOpen: false,
  settings: {
    apiKeys: { deepseek: '', anthropic: '', openai: '' }, theme: 'dark', language: 'zh-CN', fontSize: 15,
    mobileLink: { enabled: false, qrCode: '', deviceName: '' },
    thirdParty: { apiEnabled: false, apiPort: 8720, webhookUrl: '' },
    proxy: { enabled: false, host: '', port: '', auth: '' }, agent: defaultAgent,
    plugins: [
      { id: 'filesystem', name: '文件系统', description: '读写和管理本地文件', enabled: true, type: 'tool' },
      { id: 'browser', name: '网页浏览器', description: '打开和控制浏览器标签页', enabled: false, type: 'tool' },
      { id: 'terminal', name: '终端', description: '执行 Shell 命令', enabled: true, type: 'tool' },
      { id: 'calendar', name: '日历', description: '管理日历事件', enabled: false, type: 'skill' },
      { id: 'email', name: '邮件', description: '发送和阅读邮件', enabled: false, type: 'tool' },
    ],
  },
};

const chatSlice = createSlice({
  name: 'chat', initialState,
  reducers: {
    addMessage: (s, a: PayloadAction<{ sessionId: string; message: ChatMessage }>) => { const sesh = s.sessions.find(x => x.id === a.payload.sessionId); if (sesh) { sesh.messages.push(a.payload.message); if (sesh.messages.length === 1) sesh.name = a.payload.message.content.slice(0, 30) || '新对话'; } },
    newSession: (s) => { const ns: ChatSession = { id: 's_' + Date.now(), name: '新对话', messages: [], createdAt: Date.now() }; s.sessions.unshift(ns); s.activeSessionId = ns.id; },
    setActiveSession: (s, a: PayloadAction<string>) => { s.activeSessionId = a.payload; },
    setStreaming: (s, a: PayloadAction<boolean>) => { s.streaming = a.payload; },
    setStrategy: (s, a: PayloadAction<Strategy>) => { s.strategy = a.payload; },
    toggleSidebar: (s) => { s.sidebarOpen = !s.sidebarOpen; },
    toggleSettings: (s) => { s.settingsOpen = !s.settingsOpen; },
    setApiKey: (s, a: PayloadAction<{ provider: string; key: string }>) => { (s.settings.apiKeys as any)[a.payload.provider] = a.payload.key; },
    setTheme: (s, a: PayloadAction<Theme>) => { s.settings.theme = a.payload; },
    setLanguage: (s, a: PayloadAction<Language>) => { s.settings.language = a.payload; },
    setFontSize: (s, a: PayloadAction<number>) => { s.settings.fontSize = a.payload; },
    updateAgentConfig: (s, a: PayloadAction<Partial<AgentConfig>>) => { Object.assign(s.settings.agent, a.payload); },
    updateThirdParty: (s, a: PayloadAction<Partial<SettingsState['thirdParty']>>) => { Object.assign(s.settings.thirdParty, a.payload); },
    updateMobileLink: (s, a: PayloadAction<Partial<SettingsState['mobileLink']>>) => { Object.assign(s.settings.mobileLink, a.payload); },
    updateProxy: (s, a: PayloadAction<Partial<SettingsState['proxy']>>) => { Object.assign(s.settings.proxy, a.payload); },
    togglePlugin: (s, a: PayloadAction<string>) => { const p = s.settings.plugins.find(x => x.id === a.payload); if (p) p.enabled = !p.enabled; },
    addPlugin: (s, a: PayloadAction<PluginInfo>) => { s.settings.plugins.push(a.payload); },
    removePlugin: (s, a: PayloadAction<string>) => { s.settings.plugins = s.settings.plugins.filter(x => x.id !== a.payload); },
  },
});

export const { addMessage, newSession, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, addPlugin, removePlugin } = chatSlice.actions;
export default chatSlice.reducer;
