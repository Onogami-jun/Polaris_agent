import React, { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../store';

export function TerminalPopup({ onClose }: { onClose: () => void }) {
  var lang = useAppSelector(function(s:any){ return s.chat.settings.language; });
  var [shell, setShell] = useState('powershell');
  var [input, setInput] = useState('');
  var [output, setOutput] = useState('');
  var [running, setRunning] = useState(false);
  var [sessionId, setSessionId] = useState('');
  var [cwd, setCwd] = useState('');
  var [history, setHistory] = useState<string[]>([]);
  var [historyIdx, setHistoryIdx] = useState(-1);
  var outputRef = useRef<HTMLDivElement>(null);
  var inputRef = useRef<HTMLInputElement>(null);
  var pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(function(){ return function(){ if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  useEffect(function(){ if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [output]);
  useEffect(function(){ document.addEventListener('keydown', onKey); return function(){ document.removeEventListener('keydown', onKey); }; function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); } });

  var startSession = async function(t: string) {
    if (running) return;
    var api = window.electronAPI; if (!api) return;
    setRunning(true); setShell(t); setOutput('');
    var r = await api.terminalCreate(t);
    if (r.success) {
      setSessionId(r.id); setCwd(r.cwd);
      setOutput('Polaris Terminal — ' + (t==='powershell'?'PowerShell':'CMD') + '\nPID: ' + r.pid + '\nCWD: ' + r.cwd + '\n\n');
    } else { setOutput('Failed to start terminal: ' + (r.error||'')); setRunning(false); }
  };

  var sendCommand = async function() {
    var cmd = input.trim(); if (!cmd || !sessionId) return;
    var api = window.electronAPI; if (!api) return;
    setHistory(function(p) { return [...p, cmd]; }); setHistoryIdx(-1);
    setOutput(function(p) { return p + '\n> ' + cmd + '\n'; });
    setInput('');
    if (cmd === 'exit') { await api.terminalKill(sessionId); setSessionId(''); setRunning(false); setOutput(function(p) { return p + '\nSession terminated.\n'; }); return; }
    if (cmd === 'cls' || cmd === 'clear') { setOutput(''); return; }
    await api.terminalWrite(sessionId, cmd);
    await new Promise(function(r) { setTimeout(r, 400); });
    var out = await api.terminalRead(sessionId, 50);
    setOutput(function(p) { return p + (out.output||'').slice(-4000); });
  };

  var onKeyDown = function(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); sendCommand(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (history.length > 0) { var idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1); setHistoryIdx(idx); setInput(history[idx]); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (historyIdx >= 0) { var i2 = historyIdx + 1; if (i2 >= history.length) { setHistoryIdx(-1); setInput(''); } else { setHistoryIdx(i2); setInput(history[i2]); } } }
  };

  return (
    <div className="fixed inset-0 z-[350] bg-black/40 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-[700px] max-w-[94vw] h-[460px] max-h-[85vh] rounded-2xl border border-border bg-[#0c0c14] shadow-2xl overflow-hidden flex flex-col font-mono" onClick={function(e){e.stopPropagation()}}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-[#14141e]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/60"/>
              <span className="w-3 h-3 rounded-full bg-amber-500/60"/>
              <span className="w-3 h-3 rounded-full bg-emerald-500/60"/>
            </div>
            <span className="text-[11px] text-muted-foreground ml-2">{cwd||'Terminal'}</span>
          </div>
          <div className="flex items-center gap-2">
            {!running ? (
              <>
                <button className={'px-3 py-1 rounded text-[11px] font-medium transition-colors '+(shell==='powershell'?'bg-blue-600/20 text-blue-400 border border-blue-500/30':'bg-transparent text-muted-foreground hover:text-foreground')} onClick={function(){startSession('powershell')}}>PowerShell</button>
                <button className={'px-3 py-1 rounded text-[11px] font-medium transition-colors '+(shell==='cmd'?'bg-amber-600/20 text-amber-400 border border-amber-500/30':'bg-transparent text-muted-foreground hover:text-foreground')} onClick={function(){startSession('cmd')}}>CMD</button>
              </>
            ) : (
              <button className="px-3 py-1 rounded text-[11px] text-red-400 hover:bg-red-500/10 font-medium transition-colors" onClick={async function(){ var api=window.electronAPI; if(api&&sessionId){await api.terminalKill(sessionId);setSessionId('');setRunning(false);setOutput(function(p){return p+'\nSession terminated.\n'})} }}>Kill</button>
            )}
          </div>
        </div>
        {/* Output */}
        <div ref={outputRef} className="flex-1 overflow-y-auto px-4 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-[#c0c0c0]" style={{background:'#0c0c14'}}>
          {output || (!running ? <div style={{color:'#505060',textAlign:'center',paddingTop:100}}>Select a shell to start.</div> : '')}
        </div>
        {/* Input */}
        {running && (
          <div className="flex items-center px-4 py-2 border-t border-border/20 bg-[#0c0c14]">
            <span className="text-emerald-400 text-[12px] mr-2">$</span>
            <input ref={inputRef} className="flex-1 bg-transparent text-[12px] text-[#e0e0e0] outline-none font-mono" value={input} onChange={function(e){setInput(e.target.value)}} onKeyDown={onKeyDown} autoFocus placeholder="Type a command..." spellCheck={false}/>
            <span className="text-[10px] text-muted-foreground/50">{shell}</span>
          </div>
        )}
      </div>
    </div>
  );
}
