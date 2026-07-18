const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function isVoiceSupported(): boolean { return !!SpeechRecognition; }

export function startListening(lang: string, onResult: (text: string) => void, onEnd: () => void): { stop: () => void } {
  if (!SpeechRecognition) return { stop: () => {} };
  const rec = new SpeechRecognition();
  rec.lang = lang || 'zh-CN';
  rec.interimResults = false;
  rec.continuous = false;
  rec.onresult = (e: any) => { const text = e.results[0]?.[0]?.transcript; if (text) onResult(text); };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  rec.start();
  return { stop: () => rec.stop() };
}
