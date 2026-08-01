import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ── Types ──────────────────────────────────────────── */
type MascotState = 'idle' | 'walking' | 'thinking' | 'clicked' | 'sleepy';
interface Position { x: number; y: number; }

/* ── Constants ──────────────────────────────────────── */
const IDLE_TIMEOUT = 15000;  // 15s of no interaction → idle animations
const SLEEP_TIMEOUT = 60000; // 60s idle → get sleepy
const WANDER_SPEED = 3000;   // ms per wander move

/* ── Mascot component ───────────────────────────────── */
interface MascotProps {
  /** When true, mascot shows thinking animation */
  thinking?: boolean;
  /** Container ref for bounds checking */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export const Mascot: React.FC<MascotProps> = ({ thinking = false, containerRef }) => {
  const [state, setState] = useState<MascotState>('idle');
  const [pos, setPos] = useState<Position>({ x: 0, y: 0 });
  const [expression, setExpression] = useState<'normal'|'happy'|'surprised'|'sleeping'>('normal');
  const [visible, setVisible] = useState(true);
  const [clickCount, setClickCount] = useState(0);
  const lastInteraction = useRef(Date.now());
  const wanderTimer = useRef<any>(null);
  const idleCheckTimer = useRef<any>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  /* ── Wander: move to random spot ─────────────────── */
  const wander = useCallback(() => {
    const container = containerRef?.current || frameRef.current?.parentElement;
    if (!container) return;

    const cw = container.clientWidth - 80;
    const ch = container.clientHeight - 200;
    const nx = Math.max(0, Math.random() * cw);
    const ny = Math.max(0, Math.random() * ch);

    setState('walking');
    setPos({ x: nx, y: ny });
    setExpression('normal');

    setTimeout(() => {
      setState('idle');
      scheduleWander();
    }, WANDER_SPEED);
  }, [containerRef]);

  const scheduleWander = useCallback(() => {
    if (wanderTimer.current) clearTimeout(wanderTimer.current);
    wanderTimer.current = setTimeout(wander, 5000 + Math.random() * 10000);
  }, [wander]);

  /* ── Idle check loop ─────────────────────────────── */
  useEffect(() => {
    idleCheckTimer.current = setInterval(() => {
      const elapsed = Date.now() - lastInteraction.current;
      if (elapsed > SLEEP_TIMEOUT) {
        setExpression('sleeping');
        if (state === 'idle') setState('sleepy');
      } else if (elapsed > IDLE_TIMEOUT && state === 'idle') {
        scheduleWander();
      }
    }, 5000);

    // Start initial wander
    scheduleWander();

    return () => {
      if (wanderTimer.current) clearTimeout(wanderTimer.current);
      if (idleCheckTimer.current) clearInterval(idleCheckTimer.current);
    };
  }, [state, scheduleWander]);

  /* ── Thinking override ──────────────────────────── */
  useEffect(() => {
    if (thinking) {
      setState('thinking');
      setExpression('surprised');
      lastInteraction.current = Date.now();
    } else if (state === 'thinking') {
      setState('idle');
      setExpression('happy');
      setTimeout(() => setExpression('normal'), 2000);
    }
  }, [thinking]);

  /* ── Click handler ──────────────────────────────── */
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    lastInteraction.current = Date.now();
    const newCount = clickCount + 1;
    setClickCount(newCount);
    setState('clicked');
    setExpression('happy');

    // Small hop on click
    const el = e.currentTarget as HTMLElement;
    el.style.transform = 'scale(1.3) rotate(15deg)';
    setTimeout(() => {
      el.style.transform = '';
      setState('idle');
      setExpression(newCount % 5 === 0 ? 'surprised' : 'normal');
    }, 400);

    // Easter egg: 10 clicks → spiral
    if (newCount % 10 === 0) {
      setVisible(false);
      setTimeout(() => { setVisible(true); setExpression('surprised'); }, 500);
    }
  };

  /* ── Eye & expression rendering ─────────────────── */
  const eyes = () => {
    switch (expression) {
      case 'happy':
        return <>{'^^'}</>;
      case 'surprised':
        return <>{'⊙⊙'}</>;
      case 'sleeping':
        return <>{'˘˘'}</>;
      default:
        return <>{'●●'}</>;
    }
  };

  const mouth = () => {
    switch (expression) {
      case 'happy': return '▽';
      case 'surprised': return '○';
      case 'sleeping': return '～';
      default: return '﹏';
    }
  };

  /* ── Animation classes ──────────────────────────── */
  const animClass = (() => {
    switch (state) {
      case 'walking': return 'animate-bounce-mascot';
      case 'thinking': return 'animate-think-mascot';
      case 'clicked': return 'animate-pop-mascot';
      case 'sleepy': return 'animate-sleep-mascot';
      default: return 'animate-idle-mascot';
    }
  })();

  if (!visible) return null;

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <>
      <style>{`
        @keyframes bounce-mascot {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          30% { transform: translateY(-12px) rotate(-3deg); }
          60% { transform: translateY(-6px) rotate(2deg); }
        }
        @keyframes think-mascot {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.1) rotate(-5deg); }
          50% { transform: scale(1) rotate(0deg); }
          75% { transform: scale(1.08) rotate(5deg); }
        }
        @keyframes pop-mascot {
          0% { transform: scale(1); }
          50% { transform: scale(1.4) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes sleep-mascot {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(3px) scale(0.95); }
        }
        @keyframes idle-mascot {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(0deg); }
        }
        .animate-bounce-mascot { animation: bounce-mascot 0.6s ease-out; }
        .animate-think-mascot { animation: think-mascot 1.5s ease-in-out infinite; }
        .animate-pop-mascot { animation: pop-mascot 0.4s ease-out; }
        .animate-sleep-mascot { animation: sleep-mascot 3s ease-in-out infinite; }
        .animate-idle-mascot { animation: idle-mascot 4s ease-in-out infinite; }
        @keyframes float-particle {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { transform: translateY(-8px) scale(0.6); opacity: 0.8; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
      <div
        ref={frameRef}
        onClick={handleClick}
        className="fixed z-[100] select-none cursor-pointer transition-all duration-1000"
        style={{
          left: pos.x || 'calc(50% - 30px)',
          top: pos.y || 'calc(50% - 30px)',
          opacity: state === 'sleepy' ? 0.5 : 1,
        }}
      >
        {/* Body — polaris star orb */}
        <div
          className={`${animClass} relative`}
          style={{ width: 56, height: 56 }}
        >
          {/* Glow ring */}
          <div className="absolute inset-[-8px] rounded-full opacity-20 blur-md"
            style={{
              background: 'radial-gradient(circle, hsl(var(--primary)), transparent 70%)',
              animation: state === 'thinking' ? 'twinkle 1s ease-in-out infinite' : 'twinkle 3s ease-in-out infinite',
            }}
          />

          {/* Main orb */}
          <div className="absolute inset-0 rounded-full flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/.7))`,
              boxShadow: `0 0 20px hsla(var(--primary),.3)`,
            }}
          >
            {/* Thinking ring */}
            {state === 'thinking' && (
              <div className="absolute inset-[-4px] rounded-full border-2 border-transparent border-t-white/60"
                style={{ animation: 'spin 2s linear infinite' }}
              />
            )}

            {/* Face */}
            <div className="flex flex-col items-center leading-none select-none">
              <span className="text-[13px] tracking-[2px] font-bold"
                style={{ color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.2)' }}>
                {eyes()}
              </span>
              <span className="text-[10px] mt-0.5"
                style={{ color: 'rgba(255,255,255,.7)' }}>
                {state === 'thinking' ? '○' : mouth()}
              </span>
            </div>
          </div>

          {/* Particle trail when walking */}
          {state === 'walking' && (
            <>
              {[0, 1, 2].map(i => (
                <div key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-primary/40"
                  style={{
                    left: `calc(50% - ${3 + i * 8}px)`,
                    top: `calc(50% + ${i * 4}px)`,
                    animation: `float-particle ${1.5 + i * 0.3}s ease-in-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </>
          )}

          {/* ZZZ when sleepy */}
          {state === 'sleepy' && (
            <div className="absolute -top-4 -right-4 text-[12px] tracking-[2px] animate-bounce"
              style={{ color: 'hsl(var(--muted-foreground)/.5)' }}>
              Zzz
            </div>
          )}
        </div>

        {/* Click counter easter-egg */}
        {clickCount > 0 && clickCount % 5 === 0 && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-primary/60 animate-fade-in"
            style={{ animation: 'fade-in 0.3s ease-out' }}>
            ★{clickCount}★
          </div>
        )}
      </div>
    </>
  );
};
