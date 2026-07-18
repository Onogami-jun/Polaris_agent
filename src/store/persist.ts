/** localStorage-based chat persistence. No server needed. */
import type { ChatSession } from './chatSlice';

const PREFIX = 'polaris_session_';

export function saveSessions(sessions: ChatSession[]): void {
  try { sessions.forEach(s => { localStorage.setItem(PREFIX + s.id, JSON.stringify(s)); }); localStorage.setItem(PREFIX + '_index', JSON.stringify(sessions.map(s => s.id))); } catch {}
}

export function loadSessions(): ChatSession[] {
  try {
    const idx = JSON.parse(localStorage.getItem(PREFIX + '_index') || '[]');
    return idx.map((id: string) => { const raw = localStorage.getItem(PREFIX + id); return raw ? JSON.parse(raw) : null; }).filter(Boolean);
  } catch { return []; }
}

export function deleteSessionFromStorage(id: string): void {
  try { localStorage.removeItem(PREFIX + id); const idx = JSON.parse(localStorage.getItem(PREFIX + '_index') || '[]'); localStorage.setItem(PREFIX + '_index', JSON.stringify(idx.filter((x: string) => x !== id))); } catch {}
}

const SETTINGS_KEY = 'polaris_settings';
export function saveSettings(settings: any): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
export function loadSettings(): any { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
