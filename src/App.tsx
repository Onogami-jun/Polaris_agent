import React, { useEffect, useState, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from './store';
import { addMessage, newSession as newSessionAction, setActiveSession, setStreaming, setStrategy, setConnected } from './store/chatSlice';
import { query as apiQuery, createSession, healthCheck } from './services/api';
import type { ChatMessage } from './store/chatSlice';

const SUGGESTIONS = [
  '用Python写一个多线程下载器，支持断点续传',
  '帮我写一封给投资人的项目介绍邮件',
  '最近压力很大，帮我从心理学角度分析原因',
  '用简单的语言解释量子计算的基本原理',
];

const SendIcon = () => (<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 5.5L2 14l3-6.5L2 2z"/></svg>);

const ChatBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  const text = msg.content;
  return (
    <div className="msg-group">
      {!isUser && msg.model && <div className="model-labels"><span className="model-tag">{msg.model}</span></div>}
      <div className={isUser ? 'user-bubble' : 'ai-bubble'}>
        {isUser ? text : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />}
      </div>
    </div>
  );
};

const RoutePanel: React.FC<{ intent: string; strategy: string; models: string[]; rationale: string; isEnsemble: boolean }> = ({ intent, strategy, models, rationale, isEnsemble }) => (
  <div className="msg-group">
    <div className="route-panel">
      <span className={'itag' + (isEnsemble ? ' ens' : '')}>{intent}</span>
      <span className="sep">{'→'}</span>
      {models.map(m => <span key={m} className="mtag">{m}</span>)}
      <span className="sep">{'·'}</span>
      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{strategy}</span>
      {rationale && <div className="rationale">{rationale}</div>}
    </div>
  </div>
);

const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const { sessions, activeSessionId, streaming, strategy, connected } = useAppSelector(s => s.chat);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pulseClass, setPulseClass] = useState('');

  const activeSession = sessions.find(s => s.id === activeSessionId);

  useEffect(() => {
    healthCheck().then(ok => dispatch(setConnected(ok)));
    createSession(strategy).then(sid => { setSessionId(sid); dispatch(setConnected(true)); }).catch(() => dispatch(setConnected(false)));
    const timer = setInterval(() => { healthCheck().then(ok => dispatch(setConnected(ok))); }, 15000);
    return () => clearInterval(timer);
  }, [strategy, dispatch]);

  const send = useCallback(async () => {
    const t = input.trim(); if (!t || streaming) return;
    setInput(''); dispatch(setStreaming(true)); setPulseClass('think');
    setThinking('正在分析意图…');

    const userMsg: ChatMessage = { id: 'u' + Date.now(), role: 'user', content: t, timestamp: Date.now() };
    dispatch(addMessage({ sessionId: activeSessionId!, message: userMsg }));

    try {
      const data = await apiQuery(t, sessionId, strategy);
      const route = data.routing;
      setThinking('已选择: ' + route.selected_models.join(', ') + ' · 等待回复…');
      setPulseClass(route.selected_models.length > 1 ? 'ens' : '');

      const responses = data.responses || [];
      let content: string;
      let model: string;
      if (responses.length === 1) {
        content = responses[0].content || '';
        model = responses[0].model_id || '';
      } else {
        content = responses.map(r => '**▸ ' + (r.model_display || r.model_id) + '**\n\n' + (r.content || '')).join('\n\n---\n\n');
        model = responses.map(r => r.model_id).join(', ');
      }

      const aiMsg: ChatMessage = { id: 'a' + Date.now(), role: 'assistant', content, model, timestamp: Date.now() };
      dispatch(addMessage({ sessionId: activeSessionId!, message: aiMsg }));
      setPulseClass('');

      setTimeout(() => { setThinking(''); }, 2500);
    } catch (err: any) {
      const errMsg: ChatMessage = { id: 'e' + Date.now(), role: 'assistant', content: '连接失败: ' + (err.message || '未知错误') + '\n\n请确保 Polaris 后端已启动', timestamp: Date.now() };
      dispatch(addMessage({ sessionId: activeSessionId!, message: errMsg }));
      setPulseClass('');
      setThinking('');
      dispatch(setConnected(false));
    }
    dispatch(setStreaming(false));
  }, [input, streaming, sessionId, strategy, activeSessionId, dispatch]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }, [send]);

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sb-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2v4l3-2-3 4m0 8v4l-3-2 3-4m6-2l-2-3 4 3m-8 6l-2-3-4 3"/></svg>
            <span>POLARIS</span>
          </div>
          <div className="sb-badge">AGENT</div>
        </div>
        <button className="new-chat-btn" onClick={() => dispatch(newSessionAction())}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
          新对话
        </button>
        <div className="sessions">
          {sessions.map(s => (
            <div key={s.id} className={'sess-item' + (s.id === activeSessionId ? ' active' : '')} onClick={() => dispatch(setActiveSession(s.id))}>
              <div className="sess-dot" /><div className="sess-name">{s.name}</div>
              <div className="sess-date">{new Date(s.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
        <div className="sidebar-foot">
          <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
            <div className={'sf-dot' + (connected ? '' : ' off')} />
            <span>{connected ? '在线' : '离线'}</span>
          </div>
          <span>v0.2.0</span>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        <div className="main-header">
          <div className="mh-title">
            <div className={'pulse' + (pulseClass ? ' ' + pulseClass : '')} />
            Polaris Agent — 模型路由器
          </div>
          <div style={{ display:'flex', gap: 6 }}>
            {['best_quality','cost_optimized','ensemble'].map(s => (
              <button key={s} className={'strat-btn' + (strategy === s ? ' sel' + (s === 'cost_optimized' ? ' cost' : s === 'ensemble' ? ' ens' : '') : '')} onClick={() => dispatch(setStrategy(s as any))}>
                {{best_quality:'最佳质量',cost_optimized:'成本优先',ensemble:'多模型协同'}[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="chat" id="chat">
          {(!activeSession || activeSession.messages.length === 0) ? (
            <div className="empty">
              <div className="empty-logo">{'✦'}</div>
              <h2>Polaris — 您的桌面AI代理</h2>
              <p>任何问题，Polaris 都会自动选择最合适的 AI 模型来回答。试试看：</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s, i) => <div key={i} className="sug" onClick={() => { setInput(s); send(); }}>{s}</div>)}
              </div>
            </div>
          ) : (
            activeSession.messages.map(m => <ChatBubble key={m.id} msg={m} />)
          )}
          {thinking && (
            <div className="think-block">
              <div className="think-dot" />
              <span>{thinking}</span>
            </div>
          )}
          {streaming && (
            <div className="stream-row">
              <span>{'✦ 思考中'}</span>
              <div className="stream-dots"><span /><span /><span /></div>
            </div>
          )}
        </div>

        <div className="input-bar">
          <textarea value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'; }} onKeyDown={onKeyDown} placeholder={'Polaris，帮我...'} rows={1} disabled={streaming} />
          <button className="send-btn" onClick={send} disabled={streaming || !input.trim()} title="发送 (Enter)">
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

function renderMarkdown(t: string): string {
  let h = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, __, c: string) => '<pre><code>' + c.trim() + '</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/^### (.+)/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)/gm, '<h1>$1</h1>');
  h = h.replace(/^[-*] (.+)/gm, '<li>$1</li>');
  h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  h = h.replace(/^> (.+)/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/\n\n/g, '</p><p>');
  h = h.replace(/\n/g, '<br/>');
  h = '<p>' + h + '</p>';
  return h.replace(/<p>\s*<\/p>/g, '');
}

export default App;
