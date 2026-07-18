import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ChatMessage {
  id: string; role: 'user' | 'assistant';
  content: string; model?: string; timestamp: number;
  routing?: { intent: string; models: string[]; rationale: string };
}
export interface ChatSession { id: string; name: string; messages: ChatMessage[]; createdAt: number; }
export type Strategy = 'best_quality' | 'cost_optimized' | 'ensemble';

interface SettingsState { apiKeys: { deepseek: string; anthropic: string; openai: string }; }
interface ChatState {
  sessions: ChatSession[]; activeSessionId: string | null;
  streaming: boolean; strategy: Strategy;
  sidebarOpen: boolean; settingsOpen: boolean;
  settings: SettingsState;
}

const initialState: ChatState = {
  sessions: [{ id: 'default', name: 'New Chat', messages: [], createdAt: Date.now() }],
  activeSessionId: 'default', streaming: false, strategy: 'best_quality',
  sidebarOpen: true, settingsOpen: false,
  settings: { apiKeys: { deepseek: '', anthropic: '', openai: '' } },
};

const chatSlice = createSlice({
  name: 'chat', initialState,
  reducers: {
    addMessage: (s, a: PayloadAction<{ sessionId: string; message: ChatMessage }>) => {
      const session = s.sessions.find(x => x.id === a.payload.sessionId);
      if (session) { session.messages.push(a.payload.message); if (session.messages.length === 1) session.name = a.payload.message.content.slice(0, 30) || 'New Chat'; }
    },
    newSession: (s) => {
      const ns: ChatSession = { id: 's_' + Date.now(), name: 'New Chat', messages: [], createdAt: Date.now() };
      s.sessions.unshift(ns); s.activeSessionId = ns.id;
    },
    setActiveSession: (s, a: PayloadAction<string>) => { s.activeSessionId = a.payload; },
    setStreaming: (s, a: PayloadAction<boolean>) => { s.streaming = a.payload; },
    setStrategy: (s, a: PayloadAction<Strategy>) => { s.strategy = a.payload; },
    toggleSidebar: (s) => { s.sidebarOpen = !s.sidebarOpen; },
    toggleSettings: (s) => { s.settingsOpen = !s.settingsOpen; },
    setApiKey: (s, a: PayloadAction<{ provider: string; key: string }>) => {
      (s.settings.apiKeys as any)[a.payload.provider] = a.payload.key;
    },
  },
});

export const { addMessage, newSession, setActiveSession, setStreaming, setStrategy, toggleSidebar, toggleSettings, setApiKey } = chatSlice.actions;
export default chatSlice.reducer;
