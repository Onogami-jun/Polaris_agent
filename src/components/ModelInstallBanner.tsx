import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';

const DISMISS_KEY = 'polaris_model_banner_dismissed';

interface Props {
  lang: string;
  labels: {
    zh: { title: string; desc: string; install: string; installing: string; done: string; never: string; };
    en: { title: string; desc: string; install: string; installing: string; done: string; never: string; };
  };
}

export function ModelInstallBanner({ lang, labels }: Props) {
  const L = (lang === 'en' || lang === 'ja' || lang === 'fr') ? labels.en : labels.zh;
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState('');
  const [percent, setPercent] = useState(0);

  // Check server status + dismissal
  const check = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.polarisServeStatus) return;
      const s = await api.polarisServeStatus();
      if (s?.running || s?.modelInstalled) {
        setInstalled(true);
        return;
      }
    } catch {}
    // If not running and not dismissed, show banner
    const isDismissed = localStorage.getItem(DISMISS_KEY) === '1';
    if (!isDismissed && !installed) {
      setVisible(true);
    } else {
      setDismissed(isDismissed);
    }
  }, [installed]);

  useEffect(() => { check(); }, [check]);

  const handleInstall = async () => {
    setInstalling(true);
    setProgress(L.installing);
    setPercent(0);
    try {
      const api = (window as any).electronAPI;
      if (!api?.polarisModelInstall) {
        setProgress('IPC not available');
        setInstalling(false);
        return;
      }
      api.onModelInstallProgress?.((d: any) => {
        setPercent(d?.percent || 0);
        if (d?.message) setProgress(d.message);
        if (d?.phase === 'done') { setPercent(100); setProgress(L.done); setInstalling(false); setTimeout(() => setVisible(false), 4000); }
        else if (d?.phase === 'error') { setProgress('Failed: ' + (d.message || 'unknown')); setInstalling(false); }
      });
      const r = await api.polarisModelInstall();
      if (r?.success) {
        if (r.alreadyInstalled) {
          setPercent(100);
          setProgress(L.done);
        } else {
          setPercent(100);
          setProgress(L.done + ' (restart to activate)');
        }
        setTimeout(() => setVisible(false), 4000);
      } else {
        setProgress('Failed: ' + (r?.error || 'unknown'));
        setInstalling(false);
      }
    } catch (e: any) {
      setProgress('Error: ' + e.message);
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    setDismissed(true);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9998] animate-slide-up max-w-[360px]">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4"
        style={{ boxShadow: '0 0 40px rgba(59, 168, 142, 0.15)' }}>
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0 mt-0.5">🧠</div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground">{L.title}</h4>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{L.desc}</p>
          </div>
          <button onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            title="Dismiss">×</button>
        </div>

        {/* Progress / Actions */}
        {progress ? (
          <div className="space-y-2">
            {installing && percent > 0 && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono bg-muted/50 rounded-lg px-3 py-2">
              <span>{progress}</span>
              {installing && <span className="font-semibold text-foreground">{percent}%</span>}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleInstall}
              disabled={installing}
              className="flex-1 h-9 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {installing ? '⏳ ' + L.installing : L.install}
            </Button>
            <button
              onClick={handleDismiss}
              className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {L.never}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
