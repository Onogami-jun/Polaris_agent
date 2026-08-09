import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { openLoginModal } from '../store/authSlice';
import { t } from '../i18n';

export function GitPopup({ onClose }: { onClose: () => void }) {
  var d = useAppDispatch();
  var lang = useAppSelector(function(s:any){return s.chat.settings.language;});
  var ghToken = useAppSelector(function(s:any){return s.chat.settings.apiKeys.github;});

  var [repoDir, setRepoDir] = useState(localStorage.getItem('polaris_git_dir')||'');
  var [branch, setBranch] = useState('');
  var [files, setFiles] = useState<string[]>([]);
  var [loading, setLoading] = useState(false);
  var [commitMsg, setCommitMsg] = useState('');
  var [showCommit, setShowCommit] = useState(false);
  var [statusMsg, setStatusMsg] = useState('');
  var [pushMsg, setPushMsg] = useState('');
  var [prs, setPrs] = useState<any[]>([]); var [issues, setIssues] = useState<any[]>([]); var [workflows, setWorkflows] = useState<any[]>([]);
  var [showPRs, setShowPRs] = useState(false); var [showIssues, setShowIssues] = useState(false); var [showCI, setShowCI] = useState(false);
  var [repos, setRepos] = useState<any[]>([]); var [reposLoading, setReposLoading] = useState(false);
  var [searchQuery, setSearchQuery] = useState('');

  var call = function(tool:string, params?:any) {
    var api = window.electronAPI; if (!api) return Promise.reject('No API');
    return api.toolsExecute({ tool: tool, params: params || {}, ghToken: ghToken || '' });
  };

  var refreshStatus = useCallback(function() {
    if (!repoDir) return;
    setLoading(true);
    call('git_status', {dir:repoDir}).then(function(r:any){
      if (r.success) { setBranch(r.branch||''); setFiles(r.files||[]); setStatusMsg(''); }
      else { setBranch(''); setFiles([]); setStatusMsg(r.error||'Failed'); }
    }).catch(function(){setStatusMsg('Error')}).finally(function(){setLoading(false)});
  }, [repoDir, ghToken]);

  // Auto-fetch repos + status
  useEffect(function(){ if (ghToken) { setReposLoading(true); call('git_list_repos').then(function(r){ if (r.success) setRepos(r.repos||[]); }).finally(function(){ setReposLoading(false); }); } }, [ghToken]);
  useEffect(function(){ refreshStatus(); var t=setInterval(refreshStatus, 30000); return function(){clearInterval(t)}; }, [refreshStatus]);

  // Agent git ops → auto-refresh
  useEffect(function(){ var api = window.electronAPI; if (!api) return; api.onGitUpdate(function(){ if (repoDir) refreshStatus(); if (showPRs) loadPRs(); if (showIssues) loadIssues(); if (showCI) loadCI(); }); }, [repoDir, showPRs, showIssues, showCI]);

  var handleClone = async function(url: string) {
    setLoading(true); setStatusMsg('Cloning...');
    call('git_clone', {url:url}).then(function(r){
      if (r.success && r.dir) { setRepoDir(r.dir); localStorage.setItem('polaris_git_dir', r.dir); setStatusMsg(''); refreshStatus(); }
      else { setStatusMsg(r.error||'Clone failed'); }
      setLoading(false);
    });
  };

  var handleCommit = async function() {
    if (!commitMsg.trim()) return; setLoading(true);
    call('git_commit', {dir:repoDir, message:commitMsg}).then(function(r){
      if (r.success) { setCommitMsg(''); setShowCommit(false); refreshStatus(); }
      else { setStatusMsg(r.error||'Commit failed'); }
      setLoading(false);
    });
  };

  var handlePush = async function() {
    setLoading(true); setPushMsg('');
    call('git_push', {dir:repoDir}).then(function(r){
      if (r.success) { setPushMsg('Push OK. Creating PR...');
        call('git_create_pr', {dir:repoDir, title:'Polaris Agent Update', body:'Changes via Polaris Solver.'}).then(function(pr){
          setPushMsg(pr.success ? (pr.pr_url||'PR created') : 'Push OK. PR: '+(pr.error||'skipped'));
        });
      } else { setPushMsg(r.error||'Push failed'); }
      setLoading(false); refreshStatus();
    });
  };

  var loadPRs = async function() { setShowPRs(!showPRs); if (showPRs) return; setLoading(true);
    call('git_list_prs', {dir:repoDir}).then(function(r){ if (r.success) setPrs(r.prs||[]); else setStatusMsg(r.error||''); setLoading(false); });
  };
  var loadIssues = async function() { setShowIssues(!showIssues); if (showIssues) return; setLoading(true);
    call('git_list_issues', {dir:repoDir}).then(function(r){ if (r.success) setIssues(r.issues||[]); else setStatusMsg(r.error||''); setLoading(false); });
  };
  var loadCI = async function() { setShowCI(!showCI); if (showCI) return; setLoading(true);
    call('git_workflows', {dir:repoDir}).then(function(r){ if (r.success) setWorkflows(r.runs||[]); else setStatusMsg(r.error||''); setLoading(false); });
  };

  var filtered = repos.filter(function(r){ return !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()); });

  return (
    <div className="fixed inset-0 z-[300] bg-black/30 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-[720px] max-w-[96vw] h-[560px] max-h-[88vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col" onClick={function(e){e.stopPropagation()}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2v2.5M8 4.5a2 2 0 100 4 2 2 0 000-4zM4 11v2.5M12 11v2.5M8 8.5v4"/><circle cx="4" cy="13.5" r="1.3"/><circle cx="12" cy="13.5" r="1.3"/><path d="M4 11c0-1.5 1-2.5 1.5-2.5M12 11c0-1.5-1-2.5-1.5-2.5"/></svg>
            </div>
            <span className="text-sm font-semibold text-foreground">{t(lang,'git.title')}</span>
            {repoDir && <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{repoDir.split('\\').pop()||repoDir.split('/').pop()}</span>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs font-mono px-2">{t(lang,'git.esc')}</button>
        </div>

        {/* Body: Left repos + Right actions */}
        {!ghToken ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor" className="text-muted-foreground/30"><path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38v-1.49A5.5 5.5 0 011.01 10a.28.28 0 01.23-.38c.63-.01 1.08.58 1.23.82a3 3 0 003.33 1.36c.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.06-1.86 3.75-3.64 3.95.29.25.54.73.54 1.48V14c0 .21.15.46.55.38A8 8 0 0016 8a8 8 0 10-16 0z"/></svg>
              </div>
              <p className="text-sm text-foreground font-semibold">{t(lang,'git.connectTitle')}</p>
              <p className="text-[11px] text-muted-foreground max-w-[280px] mx-auto">{t(lang,'git.connectDesc')}</p>
              <button className="px-5 py-2.5 rounded-lg bg-[#24292f] hover:bg-[#1b1f23] text-xs text-white font-medium transition-colors" onClick={function(){onClose();(window as any).__pol_github_tab=true;d(openLoginModal())}}>{t(lang,'git.connectBtn')}</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Repo list */}
            <div className="w-[260px] shrink-0 border-r border-border flex flex-col bg-muted/10">
              <input className="m-3 bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-[10px] font-mono outline-none focus:border-primary/50" placeholder={t(lang,'git.filterPlaceholder')} value={searchQuery} onChange={function(e:any){setSearchQuery(e.target.value)}}/>
              <div className="flex-1 overflow-y-auto px-2 pb-2">
                {reposLoading ? <div className="text-center py-8 text-[10px] text-muted-foreground font-mono">{t(lang,'git.loading')}</div>
                : filtered.length===0 ? <div className="text-center py-8 text-[10px] text-muted-foreground">{searchQuery?'No results':t(lang,'git.noRepos')}</div>
                : filtered.map(function(r:any,i:number){
                  var isCloned = repoDir && repoDir.indexOf(r.name.replace('/','_')) >= 0;
                  return <div key={i} className={'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group '+ (isCloned?'bg-primary/5 border border-primary/10':'hover:bg-muted/50')} onClick={function(){ if(!repoDir) handleClone(r.url); }}>
                    <div className="w-4 h-4 rounded bg-muted flex items-center justify-center shrink-0">
                      {r.isPrivate
                        ? <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className="text-muted-foreground"><path fillRule="evenodd" d="M4 4v2h-.25A1.75 1.75 0 002 7.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 13.25v-5.5A1.75 1.75 0 0012.25 6H12V4a4 4 0 10-8 0zm6.5 2V4a2.5 2.5 0 00-5 0v2h5z"/></svg>
                        : <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className="text-muted-foreground"><path fillRule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-foreground truncate">{r.name}</div>
                      <div className="text-[8px] text-muted-foreground font-mono mt-0.5">{r.language||'--'} {r.stars||0}★</div>
                    </div>
                    {isCloned && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"/>}
                  </div>;
                })}
              </div>
            </div>
            {/* Right: Status/Actions */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!repoDir ? (
                <div className="text-center py-20 text-muted-foreground">
                  <p className="text-sm">Select a repository to clone.</p>
                  <p className="text-xs mt-1 opacity-50">Commit, push, and manage PRs from here.</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-[11px] mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"/>
                    <span className="font-mono text-emerald-400">{branch||'main'}</span>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="font-mono text-muted-foreground">{files.length} changed</span>
                    <button onClick={refreshStatus} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground font-mono" disabled={loading}>{loading?'...':t(lang,'git.refresh')}</button>
                  </div>

                  {statusMsg && <div className="text-[10px] text-red-400 font-mono mb-2">{statusMsg}</div>}

                  {files.length>0 && (
                    <div className="rounded-md bg-muted/20 border border-border/50 overflow-hidden max-h-[140px] overflow-y-auto mb-3">
                      <div className="px-2.5 py-1 bg-muted/30 border-b border-border/50 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{t(lang,'git.stagedChanges')}</div>
                      {files.map(function(f:any,i:number){return <div key={i} className="text-[10px] font-mono text-foreground/80 px-2.5 py-0.5">{f.trim()}</div>})}
                    </div>
                  )}
                  {files.length===0 && !loading && !statusMsg && <div className="text-center py-6 text-[10px] text-muted-foreground/50 font-mono">{t(lang,'git.clean')}</div>}

                  {files.length>0 && (showCommit ? (
                    <div className="space-y-2 mb-3">
                      <input className="w-full bg-muted border border-border rounded-md px-3 py-2 text-[10px] font-mono outline-none focus:border-primary/50" placeholder={t(lang,'git.commitMsg')} value={commitMsg} onChange={function(e:any){setCommitMsg(e.target.value)}} onKeyDown={function(e:any){if(e.key==='Enter')handleCommit()}} autoFocus/>
                      <div className="flex gap-2">
                        <button className="flex-1 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-[10px] text-muted-foreground font-mono" onClick={function(){setShowCommit(false)}}>{t(lang,'git.cancel')}</button>
                        <button className="flex-1 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white font-medium" onClick={handleCommit} disabled={loading||!commitMsg.trim()}>{loading?t(lang,'git.committing'):t(lang,'git.commit')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mb-3">
                      <button className="flex-1 py-2 rounded-md bg-primary/10 hover:bg-primary/20 text-[10px] text-primary font-medium" onClick={function(){setShowCommit(true)}}>{t(lang,'git.commit')}</button>
                      <button className="flex-1 py-2 rounded-md bg-muted hover:bg-muted/70 text-[10px] text-muted-foreground font-medium" onClick={handlePush} disabled={loading}>{loading?'...':t(lang,'git.push')}</button>
                    </div>
                  ))}

                  {pushMsg && <div className="text-[10px] font-mono p-2 rounded-md bg-muted/20 border border-border/50 text-muted-foreground mb-3">{pushMsg}</div>}

                  {/* Sub-panels: PRs / Issues / CI */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <button onClick={loadPRs} className={'py-1.5 rounded-md text-[10px] font-mono font-medium transition-colors '+(showPRs?'bg-primary/10 text-primary':'bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40')}>{t(lang,'git.prs')}</button>
                    <button onClick={loadIssues} className={'py-1.5 rounded-md text-[10px] font-mono font-medium transition-colors '+(showIssues?'bg-primary/10 text-primary':'bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40')}>{t(lang,'git.issues')}</button>
                    <button onClick={loadCI} className={'py-1.5 rounded-md text-[10px] font-mono font-medium transition-colors '+(showCI?'bg-primary/10 text-primary':'bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40')}>{t(lang,'git.ci')}</button>
                  </div>

                  {showPRs && <SubList data={prs} empty={t(lang,'git.noPRs')} kind="pr" lang={lang}/>}
                  {showIssues && <SubList data={issues} empty={t(lang,'git.noIssues')} kind="issue" lang={lang}/>}
                  {showCI && <SubListCI data={workflows} empty={t(lang,'git.noRuns')}/>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubList({data,empty,kind,lang}:{data:any[],empty:string,kind:string,lang:string}) {
  if (data.length===0) return <div className="text-[10px] text-muted-foreground/50 text-center py-2">{empty}</div>;
  return <div className="max-h-[100px] overflow-y-auto space-y-0.5 rounded-md bg-muted/10 p-1.5">
    {data.map(function(d:any,i:number){
      return <div key={i} className="polaris-inline-btn cursor-pointer text-[10px] font-mono px-2 py-0.5 rounded hover:bg-muted/30 flex items-center gap-2" data-prompt={(kind==='pr'?'Review PR #'+d.number+': '+d.title:'Look at issue #'+d.number+': '+d.title)}>
        <span className="text-muted-foreground">#{d.number}</span><span className="text-foreground/80 truncate">{d.title}</span>
        {d.labels&&d.labels.map(function(l:string){return <span key={l} className="text-[8px] px-1 rounded bg-primary/10 text-primary">{l}</span>})}
      </div>;
    })}
  </div>;
}

function SubListCI({data,empty}:{data:any[],empty:string}) {
  if (data.length===0) return <div className="text-[10px] text-muted-foreground/50 text-center py-2">{empty}</div>;
  return <div className="max-h-[100px] overflow-y-auto space-y-0.5 rounded-md bg-muted/10 p-1.5">
    {data.map(function(w:any,i:number){return <div key={i} className="text-[10px] font-mono px-2 py-0.5 rounded hover:bg-muted/30 flex items-center gap-2">
      <span className={w.conclusion==='success'?'text-emerald-400':w.conclusion==='failure'?'text-red-400':'text-amber-400'}>●</span>
      <span className="text-foreground/80 truncate">{w.name}</span>
    </div>})}
  </div>;
}
