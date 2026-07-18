interface PolarisAPI {
  query(params: { text: string; strategy: string; systemPrompt?: string }): Promise<{
    routing: { strategy: string; top_intent: string; selected_models: string[]; rationale: string; intent_scores: Record<string, number> };
    responses: { model_id: string; model_display?: string; content: string; error?: string }[];
    total_latency_ms: number;
  }>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  getVersion(): Promise<string>;
  openExternal(url: string): Promise<void>;
}

interface Window {
  electronAPI?: PolarisAPI;
}
