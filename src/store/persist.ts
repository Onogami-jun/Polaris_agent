/* localStorage chat persistence */
import type { ChatSession } from './chatSlice';

const IDX = 'ps_idx';
function pkey(id: string) { return 'ps_' + id; }

export function saveSessions(sessions: ChatSession[]): void {
  try {
    const ids: string[] = [];
    sessions.forEach(s => {
      if (s.messages.length === 0) return;
      localStorage.setItem(pkey(s.id), JSON.stringify(s));
      ids.push(s.id);
    });
    localStorage.setItem(IDX, JSON.stringify(ids));
  } catch {}
}

export function loadSessions(): ChatSession[] {
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(IDX) || '[]');
    const sessions: ChatSession[] = [];
    ids.forEach(id => {
      const raw = localStorage.getItem(pkey(id));
      if (raw) {
        const s = JSON.parse(raw);
        if (s.messages && s.messages.length > 0) sessions.push(s);
      }
    });
    return sessions;
  } catch { return []; }
}

export function deleteSessionStorage(id: string): void {
  try {
    localStorage.removeItem(pkey(id));
    const ids: string[] = JSON.parse(localStorage.getItem(IDX) || '[]');
    localStorage.setItem(IDX, JSON.stringify(ids.filter(x => x !== id)));
  } catch {}
}

const SET = 'ps_settings';
export function saveSettings(s: any): void { try { localStorage.setItem(SET, JSON.stringify(s)); } catch {} }
export function loadSettings(): any { try { return JSON.parse(localStorage.getItem(SET) || '{}'); } catch { return {}; } }
