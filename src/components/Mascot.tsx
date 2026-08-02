
import React, { useState, useEffect, useRef, useCallback } from 'react';

type State = 'idle' | 'walking' | 'thinking' | 'clicked' | 'sleepy';
type Face = 'normal'|'happy'|'surprised'|'sleeping';
interface Pos { x: number; y: number; }

const IDLE_TIME = 15000;
const SLEEP_TIME = 60000;
const WANDER_MOVE_MS = 3000;

interface MascotProps {
  thinking?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** If false, mascot is completely hidden */
  enabled?: boolean;
  /** If false, clicking does nothing */
  clickReactions?: boolean;
  /** If false, doesn't auto-wander */
  autoWander?: boolean;
  /** If false, never goes to sleep mode */
  showWhenSleepy?: boolean;
}

export const Mascot: React.FC<MascotProps> = ({
  thinking = false, containerRef,
  enabled = true, clickReactions = true, autoWander: doWander = true, showWhenSleepy = true,
}) => {
  if (!enabled) return null;
  const [state,setState]=useState<State>('idle');
  const [pos,setPos]=useState<Pos>({x:0,y:0});
  const [face,setFace]=useState<Face>('normal');
  const [clicks,setClicks]=useState(0);
  const [dragging,setDragging]=useState(false);
  const lastAct=useRef(Date.now());
  const idleT=useRef<any>(null);
  const wanderT=useRef<any>(null);
  const frameR=useRef<HTMLDivElement>(null);

  /* ── Safe zone: avoid center message column ───────────── */
  const pickSpot = useCallback(() => {
    const box = containerRef?.current || frameR.current?.parentElement;
    if (!box) return { x: 0, y: 0 };
    const W = box.clientWidth;
    const H = box.clientHeight;
    const m = 80; // mascot size + margin

    // Safe zone: keep within the outer 30% on each side, or bottom 20%
    // Left edge area: 0 to W*0.3-m ... Right edge: W*0.7 to W-m ... Bottom: H*0.7 to H-m
    const zones = [
      { xMin: m, xMax: W * 0.25 - m, yMin: m, yMax: H * 0.8 - m },      // left column
      { xMin: W * 0.75, xMax: W - m, yMin: m, yMax: H * 0.8 - m },       // right column
      { xMin: m, xMax: W * 0.25 - m, yMin: H * 0.5, yMax: H - m },       // left bottom
      { xMin: W * 0.75, xMax: W - m, yMin: H * 0.5, yMax: H - m },       // right bottom
      { xMin: W * 0.25, xMax: W * 0.75 - m, yMin: H * 0.8, yMax: H - m }, // center bottom
    ];

    // Pick random zone
    const z = zones[Math.floor(Math.random() * zones.length)];
    return {
      x: z.xMin + Math.random() * Math.max(0, z.xMax - z.xMin),
      y: z.yMin + Math.random() * Math.max(0, z.yMax - z.yMin),
    };
  }, [containerRef]);

  const wander = useCallback(() => {
    setState('walking');
    setPos(pickSpot());
    setFace('normal');
    setTimeout(() => { setState('idle'); scheduleW(); }, WANDER_MOVE_MS);
  }, [pickSpot]);

  const scheduleW = useCallback(() => {
    if (wanderT.current) clearTimeout(wanderT.current);
    if (doWander) wanderT.current = setTimeout(wander, 4000 + Math.random() * 8000);
  }, [wander, doWander]);

  useEffect(() => {
    idleT.current = setInterval(() => {
      const dt = Date.now() - lastAct.current;
      if (dt > SLEEP_TIME && state === 'idle' && showWhenSleepy) { setFace('sleeping'); setState('sleepy'); }
      else if (dt > IDLE_TIME && state === 'idle' && doWander) scheduleW();
    }, 5000);
    // Initial position
    setPos(pickSpot());
    scheduleW();
    return () => { clearInterval(idleT.current); clearTimeout(wanderT.current); };
  }, [state, scheduleW]);

  useEffect(() => {
    if (thinking) { setState('thinking'); setFace('surprised'); lastAct.current = Date.now(); }
    else if (state === 'thinking') { setState('idle'); setFace('happy'); setTimeout(() => setFace('normal'), 2000); }
  }, [thinking]);

  // Click
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation(); lastAct.current = Date.now();
    if (!clickReactions) return;
    const n = clicks + 1; setClicks(n); setState('clicked'); setFace('happy');
    const el = e.currentTarget as HTMLElement;
    el.style.transform = 'scale(1.3) rotate(15deg)';
    setTimeout(() => { el.style.transform = ''; setState('idle'); setFace(n%5===0?'surprised':'normal'); }, 400);
    if (n % 10 === 0) { setState('clicked'); setFace('surprised'); setTimeout(() => setState('idle'), 800); }
  };

  // Drag
  const dragStart = useRef<Pos>({x:0,y:0});
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    lastAct.current = Date.now(); setDragging(true); setState('clicked'); setFace('surprised');
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const mv = (ev: MouseEvent) => { setPos({ x: ev.clientX - dragStart.current.x, y: ev.clientY - dragStart.current.y }); };
    const up = () => { setDragging(false); setState('idle'); setFace('normal'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  };

  const showFace = (f: Face) => {
    switch (f) {
      case 'happy': return { e: '^^', m: '▽' };
      case 'surprised': return { e: '⊙⊙', m: '○' };
      case 'sleeping': return { e: '˘˘', m: '～' };
      default: return { e: '◉◉', m: '﹏' };
    }
  };
  const f = showFace(face);

  const animKey = (): string => {
    if (state === 'walking') return 'bounce-mascot';
    if (state === 'thinking') return 'think-mascot';
    if (state === 'clicked') return 'pop-mascot';
    if (state === 'sleepy') return 'sleep-mascot';
    return 'idle-mascot';
  };

  return (
    <>
      <style>{`
        @keyframes bounce-m { 0%,100%{transform:translateY(0) rotate(0deg)} 30%{transform:translateY(-14px) rotate(-4deg)} 60%{transform:translateY(-7px) rotate(3deg)} }
        @keyframes think-m { 0%,100%{transform:scale(1) rotate(0deg)} 25%{transform:scale(1.12) rotate(-6deg)} 50%{transform:scale(1) rotate(0deg)} 75%{transform:scale(1.1) rotate(6deg)} }
        @keyframes pop-m { 0%{transform:scale(1)} 40%{transform:scale(0.85)} 60%{transform:scale(1.35) rotate(8deg)} 100%{transform:scale(1) rotate(0deg)} }
        @keyframes sleep-m { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(5px) scale(0.95)} }
        @keyframes idle-m { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-4px) rotate(0deg)} }
        .bounce-mascot { animation: bounce-m 0.7s ease-out; }
        .think-mascot { animation: think-m 1.6s ease-in-out infinite; }
        .pop-mascot { animation: pop-m 0.45s ease-out; }
        .sleep-mascot { animation: sleep-m 3s ease-in-out infinite; }
        .idle-mascot { animation: idle-m 4s ease-in-out infinite; }
        @keyframes trail { 0%,100%{opacity:0.3;transform:translateX(0)} 50%{opacity:0.8;transform:translateX(6px)} }
        @keyframes twinkle { 0%,100%{opacity:0.2} 50%{opacity:1} }
        @keyframes wobble { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
        @keyframes zzz-float { 0%{opacity:0.6;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-30px) scale(1.5)} }
        @keyframes blush-pulse { 0%,100%{opacity:0.5} 50%{opacity:0.9} }
      `}</style>
      <div
        ref={frameR}
        onClick={onClick}
        onMouseDown={onDragStart}
        className={`absolute z-[5] select-none ${dragging?'cursor-grabbing':'cursor-pointer'} transition-all`}
        style={{
          left: pos.x || 'calc(50% - 40px)',
          top: pos.y || 'calc(50% - 40px)',
          opacity: state === 'sleepy' ? 0.55 : 1,
          transitionDuration: state === 'walking' ? '3s' : '0.6s',
          transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)',
          pointerEvents: dragging ? 'auto' : 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          {/* ── Glow aura ── */}
          <div
            style={{
              position:'absolute', left:-14, top:-14, width:108, height:108, borderRadius:'50%',
              background: 'radial-gradient(circle, hsla(var(--primary)/.2) 0%, transparent 70%)',
              animation: state==='thinking'?'twinkle 1s ease-in-out infinite':'twinkle 3s ease-in-out infinite',
            }}
          />

          {/* ── Chibi Star Body ── */}
          <div className={animKey()} style={{ position:'relative', width:80, height:80, filter: 'drop-shadow(0 4px 12px hsla(var(--primary)/.3))' }}>
            {/* Star SVG — soft chibi shape */}
            <svg viewBox="-40 -40 80 80" style={{ width:80, height:80 }} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="bodyGrad" cx="40%" cy="30%">
                  <stop offset="0%" stopColor="#d4b8ff"/>
                  <stop offset="60%" stopColor="#9b6fe8"/>
                  <stop offset="100%" stopColor="#7b50d0"/>
                </radialGradient>
                <radialGradient id="bellyGrad" cx="50%" cy="50%">
                  <stop offset="0%" stopColor="#f5f0ff"/>
                  <stop offset="100%" stopColor="#e4d6ff"/>
                </radialGradient>
                <filter id="softShadow">
                  <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#4a2080" floodOpacity="0.25"/>
                </filter>
              </defs>

              {/* Body — rounded 5-point star */}
              <path d="M0,-28 C3,-26 6,-22 9,-25 C12,-20 16,-16 20,-13 C22,-8 24,-6 26,0 C24,3 22,6 20,11 C16,14 12,18 9,21 C6,18 3,22 0,26 C-3,22 -6,18 -9,21 C-12,18 -16,14 -20,11 C-22,6 -24,3 -26,0 C-24,-6 -22,-8 -20,-13 C-16,-16 -12,-20 -9,-25 C-6,-22 -3,-26 0,-28Z"
                fill="url(#bodyGrad)" filter="url(#softShadow)" />

              {/* Belly — soft cream patch */}
              <ellipse cx="0" cy="4" rx="14" ry="11" fill="url(#bellyGrad)" opacity="0.7"/>

              {/* Blush spots */}
              <ellipse cx="-15" cy="2" rx="5" ry="3.5" fill="#ffb3c0" opacity="0.55"
                style={{ animation: face==='happy'||face==='surprised'?'blush-pulse 1s ease-in-out infinite':'' }}/>
              <ellipse cx="15" cy="2" rx="5" ry="3.5" fill="#ffb3c0" opacity="0.55"
                style={{ animation: face==='happy'||face==='surprised'?'blush-pulse 1s ease-in-out infinite':'' }}/>

              {/* Eyes */}
              {face==='sleeping' ? (
                <>
                  <line x1="-12" y1="-6" x2="-6" y2="-6" stroke="#1a1630" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="6" y1="-6" x2="12" y2="-6" stroke="#1a1630" strokeWidth="2.5" strokeLinecap="round"/>
                </>
              ) : (
                <>
                  {/* Left eye */}
                  <ellipse cx="-11" cy="-5" rx="7" ry="8" fill="#1a1630"/>
                  <ellipse cx="-9" cy="-7" rx="2.8" ry="2.8" fill="#fff" opacity="0.9"/>
                  <ellipse cx="-11.5" cy="-3" rx="1.2" ry="1.2" fill="#fff" opacity="0.5"/>
                  {/* Right eye */}
                  <ellipse cx="11" cy="-5" rx="7" ry="8" fill="#1a1630"/>
                  <ellipse cx="13" cy="-7" rx="2.8" ry="2.8" fill="#fff" opacity="0.9"/>
                  <ellipse cx="11.5" cy="-3" rx="1.2" ry="1.2" fill="#fff" opacity="0.5"/>
                </>
              )}

              {/* Mouth */}
              <path d={face==='happy'?'M-5,7 Q0,14 5,7':face==='surprised'?'M-4,8 a4,4 0 0,0 8,0':face==='sleeping'?'M-4,8 Q0,5 4,8':'M-5,8 Q0,4 5,8'}
                fill="none" stroke="#1a1630" strokeWidth="1.5" strokeLinecap="round"/>

              {/* Tiny teeth (when happy) */}
              {face==='happy' && <rect x="-2" y="8" width="4" height="3" rx="1" fill="#fff"/>}

              {/* Antennae (top of head) */}
              <g style={{ animation: 'wobble 3s ease-in-out infinite' }}>
                <path d="M-8,-26 Q-14,-36 -16,-42" fill="none" stroke="#9b6fe8" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="-16" cy="-42" r="2.5" fill="#ffe8a0" opacity="0.9"/>
              </g>
              <g style={{ animation: 'wobble 2.5s ease-in-out infinite', animationDelay: '0.3s' }}>
                <path d="M8,-26 Q14,-36 16,-42" fill="none" stroke="#9b6fe8" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="16" cy="-42" r="2.5" fill="#ffe8a0" opacity="0.9"/>
              </g>

              {/* Thinking ? mark */}
              {state==='thinking' && (
                <text x="-4" y="-46" fontSize="16" fontWeight="bold" fill="#7b50d0" style={{animation:'bounce-m 1.5s ease-in-out infinite'}}>?</text>
              )}
            </svg>

            {/* ── Tiny feet ── */}
            <div style={{ position:'absolute', bottom:-6, left:22, width:14, height:8, borderRadius:7, background:'#7b50d0', opacity:0.6,
              transform: state==='walking'?'translateY(-3px)':'none', transition:'transform .3s' }}/>
            <div style={{ position:'absolute', bottom:-6, right:22, width:14, height:8, borderRadius:7, background:'#7b50d0', opacity:0.6,
              transform: state==='walking'?'translateY(-6px)':'none', transition:'transform .3s .15s' }}/>

            {/* ── Trail particles ── */}
            {state==='walking' && [0,1,2].map(i => (
              <div key={i} style={{
                position:'absolute', bottom:4, left: `calc(50% - ${4 + i * 10}px)`, width:5, height:5,
                borderRadius:'50%', background:'hsla(var(--primary)/.4)',
                animation: `trail ${1.2 + i * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.15}s`,
              }}/>
            ))}

            {/* ── Zzz ── */}
            {state==='sleepy' && [0,1].map(i => (
              <div key={i} style={{
                position:'absolute', top:-10 - i * 12, right:-12 + i * 4, fontSize:11, fontWeight:'bold',
                color:'hsl(var(--muted-foreground)/.5)',
                animation: `zzz-float ${2 + i * 0.8}s ease-out infinite`, animationDelay: `${i * 1.2}s`,
              }}>z</div>
            ))}
          </div>

          {/* ── Click counter ── */}
          {clicks>0 && clicks%5===0 && state==='idle' && (
            <div style={{ position:'absolute', top:-16, left:'50%', transform:'translateX(-50%)', fontSize:10, fontFamily:'monospace', color:'hsl(var(--primary)/.6)' }}>
              ★{clicks}★
            </div>
          )}
        </div>
      </div>
    </>
  );
};
