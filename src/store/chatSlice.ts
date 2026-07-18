import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; model?: string; timestamp: number; routing?: { intent: string; models: string[]; rationale: string; }; edited?: boolean; }
export interface ChatSession { id: string; name: string; messages: ChatMessage[]; createdAt: number; parentId?: string; }
export type Strategy = 'best_quality' | 'cost_optimized' | 'ensemble'; export type Theme = 'dark' | 'light'; export type Language = 'en' | 'zh-CN';

interface AgentConfig { name: string; systemPrompt: string; maxTokens: number; temperature: number; reasoningStyle: 'concise' | 'detailed' | 'creative'; autoExecute: boolean; webSearch: boolean; }
export interface PluginInfo { id: string; name: string; description: string; enabled: boolean; type: 'mcp_server' | 'tool' | 'skill'; config?: Record<string, string>; }
export interface PromptTemplate { id: string; name: string; content: string; category: string; }

interface SettingsState {
  apiKeys: { deepseek: string; anthropic: string; openai: string; serper: string };
  theme: Theme; language: Language; fontSize: number;
  mobileLink: { enabled: boolean; qrCode: string; deviceName: string };
  thirdParty: { apiEnabled: boolean; apiPort: number; webhookUrl: string };
  proxy: { enabled: boolean; host: string; port: string; auth: string };
  agent: AgentConfig; plugins: PluginInfo[]; promptTemplates: PromptTemplate[];
  memory: { enabled: boolean; entries: { key: string; value: string; timestamp: number }[] };
}

interface ChatState {
  sessions: ChatSession[]; activeSessionId: string | null;
  streaming: boolean; strategy: Strategy;
  sidebarOpen: boolean; settingsOpen: boolean; settings: SettingsState;
  contextTokens: { used: number; total: number; };
}

const defaultAgent: AgentConfig = { name: 'Polaris', systemPrompt: '你是Polaris，一个桌面AI助手。用中文回复。', maxTokens: 4096, temperature: 0.7, reasoningStyle: 'detailed', autoExecute: false, webSearch: false };

const initialState: ChatState = {
  sessions: [{ id: 'default', name: '新对话', messages: [], createdAt: Date.now() }],
  activeSessionId: 'default', streaming: false, strategy: 'best_quality', sidebarOpen: true, settingsOpen: false,
  contextTokens: { used: 0, total: 128000 },
  settings: {
    apiKeys: { deepseek: '', anthropic: '', openai: '', serper: '' }, theme: 'dark', language: 'zh-CN', fontSize: 15,
    mobileLink: { enabled: false, qrCode: '', deviceName: '' }, thirdParty: { apiEnabled: false, apiPort: 8720, webhookUrl: '' },
    proxy: { enabled: false, host: '', port: '', auth: '' }, agent: defaultAgent,
    plugins: [{ id:'filesystem',name:'文件系统',description:'读写和管理本地文件',enabled:true,type:'tool' },{ id:'browser',name:'网页浏览器',description:'打开和控制浏览器标签页',enabled:false,type:'tool' },{ id:'terminal',name:'终端',description:'执行 Shell 命令',enabled:true,type:'tool' },{ id:'calendar',name:'日历',description:'管理日历事件',enabled:false,type:'skill' },{ id:'email',name:'邮件',description:'发送和阅读邮件',enabled:false,type:'tool' }],
    promptTemplates: [{ id:'t1',name:'代码审查',content:'请审查以下代码，指出潜在问题、性能瓶颈和安全风险：\n\n```\n{{code}}\n```',category:'开发' },{ id:'t2',name:'邮件撰写',content:'帮我写一封邮件。\n收件人：{{to}}\n主题：{{subject}}\n要点：{{points}}',category:'写作' },{ id:'t3',name:'翻译',content:'请将以下内容翻译为{{language}}，保持原文风格和语气：\n{{text}}',category:'写作' },{ id:'t4',name:'摘要',content:'请为以下内容生成一份简洁的摘要（200字以内）：\n{{content}}',category:'研究' },{ id:'t5',name:'会议纪要',content:'根据以下讨论内容生成一份结构化的会议纪要（议题-结论-行动项）：\n{{transcript}}',category:'写作' }],
    memory: { enabled: true, entries: [] },
  },
};

const chatSlice = createSlice({ name: 'chat', initialState, reducers: {
  addMessage: (s, a: PayloadAction<{ sessionId: string; message: ChatMessage }>) => { const sesh = s.sessions.find(x => x.id === a.payload.sessionId); if (sesh) { sesh.messages.push(a.payload.message); if (sesh.messages.length === 1) sesh.name = a.payload.message.content.slice(0, 30) || '新对话'; const all = sesh.messages.map(m => m.content).join(' '); s.contextTokens.used = Math.round(all.length * 0.6); } },
  editMessage: (s, a: PayloadAction<{ sessionId: string; messageId: string; content: string }>) => { const sesh = s.sessions.find(x => x.id === a.payload.sessionId); if (sesh) { const msg = sesh.messages.find(x => x.id === a.payload.messageId); if (msg) { msg.content = a.payload.content; msg.edited = true; } } },
  newSession: (s) => { const ns: ChatSession = { id: 's_' + Date.now(), name: '新对话', messages: [], createdAt: Date.now() }; s.sessions.unshift(ns); s.activeSessionId = ns.id; s.contextTokens = { used: 0, total: 128000 }; },
  branchSession: (s, a: PayloadAction<{ sourceSessionId: string; upToMessageId: string }>) => { const src = s.sessions.find(x => x.id === a.payload.sourceSessionId); if (!src) return; const idx = src.messages.findIndex(x => x.id === a.payload.upToMessageId); const msgs = idx >= 0 ? src.messages.slice(0, idx + 1).map(m => ({...m, id: m.id + '_b'})) : []; const ns: ChatSession = { id: 'b_' + Date.now(), name: src.name + ' (分支)', messages: msgs, createdAt: Date.now(), parentId: src.id }; s.sessions.unshift(ns); s.activeSessionId = ns.id; },
  deleteSession: (s, a: PayloadAction<string>) => { s.sessions = s.sessions.filter(x => x.id !== a.payload); if (s.activeSessionId === a.payload) s.activeSessionId = s.sessions[0]?.id || null; },
  setActiveSession: (s, a: PayloadAction<string>) => { s.activeSessionId = a.payload; },
  setStreaming: (s, a: PayloadAction<boolean>) => { s.streaming = a.payload; }, setStrategy: (s, a: PayloadAction<Strategy>) => { s.strategy = a.payload; },
  toggleSidebar: (s) => { s.sidebarOpen = !s.sidebarOpen; }, toggleSettings: (s) => { s.settingsOpen = !s.settingsOpen; },
  setApiKey: (s, a: PayloadAction<{ provider: string; key: string }>) => { (s.settings.apiKeys as any)[a.payload.provider] = a.payload.key; },
  setTheme: (s, a: PayloadAction<Theme>) => { s.settings.theme = a.payload; }, setLanguage: (s, a: PayloadAction<Language>) => { s.settings.language = a.payload; },
  setFontSize: (s, a: PayloadAction<number>) => { s.settings.fontSize = a.payload; },
  updateAgentConfig: (s, a: PayloadAction<Partial<AgentConfig>>) => { Object.assign(s.settings.agent, a.payload); },
  updateThirdParty: (s, a: PayloadAction<Partial<SettingsState['thirdParty']>>) => { Object.assign(s.settings.thirdParty, a.payload); },
  updateMobileLink: (s, a: PayloadAction<Partial<SettingsState['mobileLink']>>) => { Object.assign(s.settings.mobileLink, a.payload); },
  updateProxy: (s, a: PayloadAction<Partial<SettingsState['proxy']>>) => { Object.assign(s.settings.proxy, a.payload); },
  togglePlugin: (s, a: PayloadAction<string>) => { const p = s.settings.plugins.find(x => x.id === a.payload); if (p) p.enabled = !p.enabled; },
  addPlugin: (s, a: PayloadAction<PluginInfo>) => { s.settings.plugins.push(a.payload); },
  removePlugin: (s, a: PayloadAction<string>) => { s.settings.plugins = s.settings.plugins.filter(x => x.id !== a.payload); },
  addMemory: (s, a: PayloadAction<{ key: string; value: string }>) => { s.settings.memory.entries.push({...a.payload, timestamp: Date.now()}); },
  addPromptTemplate: (s, a: PayloadAction<PromptTemplate>) => { s.settings.promptTemplates.push(a.payload); },
  removePromptTemplate: (s, a: PayloadAction<string>) => { s.settings.promptTemplates = s.settings.promptTemplates.filter(x => x.id !== a.payload); },
}});

export const { addMessage, editMessage, newSession, branchSession, deleteSession, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings, setApiKey, setTheme, setLanguage, setFontSize, updateAgentConfig, updateThirdParty, updateMobileLink, updateProxy, togglePlugin, addPlugin, removePlugin, addMemory, addPromptTemplate, removePromptTemplate } = chatSlice.actions;
export default chatSlice.reducer;
