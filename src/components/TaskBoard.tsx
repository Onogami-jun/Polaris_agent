import React, { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { t } from '../i18n';

var CAT_COLORS:any = {
  git:'#3ba88e', filesystem:'#5a8ad4', optimize:'#c8a96e', research:'#d4a85a', agent:'#a088c8', system:'#8a8794',
};

export function TaskBoard({ execLog, todoSteps, plan, planProg }: {
  execLog: any[], todoSteps: any[], plan: any, planProg: any,
}) {
  var lang = useAppSelector(function(s:any){ return s.chat.settings.language; });
  var streaming = useAppSelector(function(s:any){ return s.chat.streaming; });
  var scroller = useRef<HTMLDivElement>(null);

  useEffect(function(){ if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [execLog, todoSteps]);

  // Auto-step from planProg
  var steps = (plan && plan.steps) ? plan.steps : (todoSteps || []).map(function(t:any, i:number) {
    return { id: t.id || ('step_'+i), label: t.label || t.skill || '', skill: t.skill || '', status: t.status || 'pending', category: t.category || 'agent', params: t.params };
  });

  // Merge planProg status into steps
  if (planProg && planProg.step !== undefined) {
    var idx = planProg.step;
    steps = steps.map(function(s:any, i:number) {
      if (i < idx) return Object.assign({}, s, { status: 'done' });
      if (i === idx) return Object.assign({}, s, { status: planProg.status || 'running' });
      return s;
    });
  }
  if (streaming && steps.length > 0 && steps.every(function(s:any){ return s.status === 'pending'; })) {
    steps[0].status = 'running';
  }

  var hasContent = steps.length > 0 || (execLog && execLog.length > 0);
  var statusText = streaming ? 'Active' : hasContent ? 'Ready' : 'Idle';

  return (
    <div className="flex flex-col h-full" style={{background:'var(--p-card, hsl(var(--card)))'}}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{background:streaming?'var(--p-gold, hsl(var(--primary)))':'var(--p-text-muted, hsl(var(--muted-foreground)))',animation:streaming?'pulse 2s ease-in-out infinite':''}}/>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">Workflow</span>
        <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded-md" style={{color:streaming?'var(--p-gold,hsl(var(--primary)))':'var(--p-text-muted,hsl(var(--muted-foreground)))',background:streaming?'hsla(var(--primary),.1)':'hsl(var(--muted))'}}>{statusText}</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-2" ref={scroller}>
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'hsl(var(--muted))'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{color:'hsl(var(--muted-foreground))',opacity:.4}}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            </div>
            <p className="text-[10px] text-muted-foreground/40 font-mono">{t(lang,'workflow.waiting')}</p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Plan steps */}
            {steps.map(function(s:any, i:number) {
              var isLast = i === steps.length - 1;
              var status = s.status || 'pending';
              var color = CAT_COLORS[s.category] || '#8a8794';
              return (
                <div key={s.id} className="relative pl-5 pb-3 last:pb-0">
                  {!isLast && <div className="absolute left-[7px] top-3 w-0.5 bg-border/40" style={{height:'calc(100% - 4px)'}}/>}
                  {/* Dot */}
                  <div className="absolute left-[3px] top-1.5 w-2.5 h-2.5 rounded-full border-2 transition-all" style={{
                    borderColor: status==='running'?color:status==='done'?color:'hsl(var(--border))',
                    background: status==='running'?color:status==='done'?color:'transparent',
                    boxShadow: status==='running'?'0 0 6px '+color:'',
                  }}/>
                  {/* Card */}
                  <div className="rounded-lg px-2.5 py-1.5 transition-all" style={{
                    background: status==='running'?(color+'15'):'transparent',
                    border: status==='running'?('1px solid '+color+'30'):'1px solid transparent',
                    opacity: status==='done'?0.5:1,
                  }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono font-semibold uppercase px-1 py-0.5 rounded" style={{background:color+'20',color:color}}>{s.category||'skill'}</span>
                      <span className="text-[11px] font-medium text-foreground leading-snug">{s.label||s.skill}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Exec log chips */}
            {execLog && execLog.length > 0 && (
              <div className="pt-2">
                <div className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider font-mono mb-1 px-1">Tools</div>
                <div className="space-y-0.5">
                  {execLog.slice(-8).reverse().map(function(e:any) {
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px]" style={{background:e.status==='running'?'hsla(var(--primary),.06)':e.status==='error'?'hsla(var(--destructive),.06)':'transparent'}}>
                        <span className="font-mono font-semibold text-foreground shrink-0">{e.tool}</span>
                        <span className="flex-1 text-muted-foreground truncate">{e.detail||''}</span>
                        <span className="text-[8px] text-muted-foreground/40 font-mono shrink-0">{e.time}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
