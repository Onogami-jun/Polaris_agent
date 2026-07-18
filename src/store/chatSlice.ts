import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; model?: string; timestamp: number; }
export interface RouteInfo { topIntent: string; strategy: string; models: string[]; rationale: string; }
export interface ChatSession { id: string; name: string; messages: ChatMessage[]; createdAt: number; }

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  streaming: boolean;
  strategy: 'best_quality' | 'cost_optimized' | 'ensemble';
  connected: boolean;
}

const initialState: ChatState = { sessions: [{ id: 'default', name: '新对话', messages: [], createdAt: Date.now() }], activeSessionId: 'default', streaming: false, strategy: 'best_quality', connected: false };

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<{ sessionId: string; message: ChatMessage }>) => {
      const s = state.sessions.find(x => x.id === action.payload.sessionId);
      if (s) { s.messages.push(action.payload.message); s.name = s.messages[0]?.content.slice(0, 30) || '新对话'; }
    },
    newSession: (state) => {
      const ns: ChatSession = { id: 's_' + Date.now(), name: '新对话', messages: [], createdAt: Date.now() };
      state.sessions.unshift(ns); state.activeSessionId = ns.id;
    },
    setActiveSession: (state, action: PayloadAction<string>) => { state.activeSessionId = action.payload; },
    setStreaming: (state, action: PayloadAction<boolean>) => { state.streaming = action.payload; },
    setStrategy: (state, action: PayloadAction<ChatState['strategy']>) => { state.strategy = action.payload; },
    setConnected: (state, action: PayloadAction<boolean>) => { state.connected = action.payload; },
  },
});

export const { addMessage, newSession, setActiveSession, setStreaming, setStrategy, setConnected } = chatSlice.actions;
export default chatSlice.reducer;
