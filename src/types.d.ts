interface PolarisAPI {
  query(params: { text: string; strategy: string; systemPrompt?: string; images?: string[] }): Promise<{
    routing: { strategy: string; top_intent: string; selected_models: string[]; rationale: string; intent_scores: Record<string, number> };
    responses: { model_id: string; model_display?: string; content: string; error?: string }[];
    total_latency_ms: number;
  }>;
  minimize(): Promise<void>; maximize(): Promise<void>; close(): Promise<void>;
  getVersion(): Promise<string>; openExternal(url: string): Promise<void>;
  // Desktop automation
  desktopScreenshot(): Promise<string | null>;
  desktopListWindows(): Promise<any[]>;
  desktopFocusWindow(title: string): Promise<any>;
  desktopOpenApp(path: string): Promise<any>;
  desktopOpenBrowser(url: string): Promise<any>;
  desktopOpenExplorer(dir: string): Promise<any>;
  desktopTypeText(text: string): Promise<any>;
  desktopPressKey(key: string): Promise<any>;
  desktopHotkey(combo: string): Promise<any>;
  desktopMoveMouse(x: number, y: number): Promise<any>;
  desktopClickMouse(x: number, y: number, btn?: string): Promise<any>;
  desktopDoubleClick(x: number, y: number): Promise<any>;
  desktopScrollMouse(dir: string, amt: number): Promise<any>;
  desktopGetClipboard(): Promise<string>;
  desktopSetClipboard(text: string): Promise<boolean>;
  desktopSystemInfo(): Promise<any>;
  desktopListFiles(dir: string): Promise<any[]>;
  desktopReadFile(path: string): Promise<string | null>;
  desktopWriteFile(path: string, content: string): Promise<any>;
  desktopRunCommand(cmd: string): Promise<string>;
  desktopAgentStep(params: { goal: string; screenshot?: string; history?: string }): Promise<{ action: any; raw: string }>;
}
interface Window { electronAPI?: PolarisAPI; }
