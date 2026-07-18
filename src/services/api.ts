const API = 'http://localhost:8026';

export interface ApiQueryResult {
  query: string; session_id: string;
  routing: { strategy: string; top_intent: string; selected_models: string[]; rationale: string; intent_scores: Record<string, number> };
  responses: { model_id: string; model_display: string; provider: string; content: string; latency_ms: number; error?: string; }[];
  ensemble?: any; total_latency_ms: number;
}

export async function createSession(strategy: string): Promise<string> {
  const r = await fetch(API + '/api/session', { method: 'POST', body: new URLSearchParams({ strategy }) });
  const d = await r.json(); return d.session_id;
}

export async function query(text: string, sessionId: string, strategy: string): Promise<ApiQueryResult> {
  const fd = new URLSearchParams({ text, session_id: sessionId, strategy });
  const r = await fetch(API + '/api/query', { method: 'POST', body: fd });
  return r.json();
}

export async function healthCheck(): Promise<boolean> {
  try { const r = await fetch(API + '/api/health'); return r.ok; } catch { return false; }
}
