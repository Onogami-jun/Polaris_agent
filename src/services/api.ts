// Polaris API — calls embedded router via Electron IPC (no backend needed)
import type { Strategy } from '../store/chatSlice';

export interface QueryResult {
  routing: { strategy: string; top_intent: string; selected_models: string[]; rationale: string; intent_scores: Record<string, number> };
  responses: { model_id: string; model_display?: string; content: string; error?: string }[];
  total_latency_ms: number;
}

export async function query(text: string, strategy: Strategy): Promise<QueryResult> {
  return window.electronAPI!.query({ text, strategy, systemPrompt: '' });
}
