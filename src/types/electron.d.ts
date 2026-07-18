interface PolarisAPI {
  query(params: { text: string; strategy: string; systemPrompt?: string; images?: string[] }): Promise<{ routing: { strategy: string; top_intent: string; selected_models: string[]; rationale: string; intent_scores: Record<string, number> }; responses: { model_id: string; model_display?: string; content: string; error?: string }[]; total_latency_ms: number; }>;
  queryStream(params: { text: string; strategy: string; systemPrompt?: string; images?: string[] }): Promise<any>;
  onStreamChunk(cb: (data: { content: string; full: string }) => void): void;
  onStreamEnd(cb: (data: any) => void): void; onStreamError(cb: (data: any) => void): void; removeStreamListeners(): void;
  minimize(): Promise<void>; maximize(): Promise<void>; close(): Promise<void>; getVersion(): Promise<string>; openExternal(url: string): Promise<void>;
  desktopScreenshot(): Promise<string|null>; desktopListWindows(): Promise<any[]>; desktopFocusWindow(t: string): Promise<any>;
  desktopOpenApp(p: string): Promise<any>; desktopOpenBrowser(u: string): Promise<any>; desktopOpenExplorer(d: string): Promise<any>;
  desktopTypeText(t: string): Promise<any>; desktopPressKey(k: string): Promise<any>; desktopHotkey(c: string): Promise<any>;
  desktopMoveMouse(x: number, y: number): Promise<any>; desktopClickMouse(x: number, y: number, b?: string): Promise<any>;
  desktopDoubleClick(x: number, y: number): Promise<any>; desktopScrollMouse(d: string, a: number): Promise<any>;
  desktopGetClipboard(): Promise<string>; desktopSetClipboard(t: string): Promise<boolean>; desktopSystemInfo(): Promise<any>;
  desktopListFiles(d: string): Promise<any[]>; desktopReadFile(p: string): Promise<string|null>; desktopWriteFile(p: string, c: string): Promise<any>;
  desktopRunCommand(c: string): Promise<string>; desktopAgentStep(p: { goal: string; screenshot?: string; history?: string }): Promise<{ action: any; raw: string }>;
  mcpStart(p: { id: string; command: string; args: string[]; env?: Record<string,string> }): Promise<{ success: boolean; pid?: number; message?: string }>;
  mcpStop(id: string): Promise<{ success: boolean }>; mcpList(): Promise<{ id: string; pid: number; running: boolean }[]>;
  notify(p: { title: string; body: string }): Promise<boolean>;
}
interface Window { electronAPI?: PolarisAPI; }
