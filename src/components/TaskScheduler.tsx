import React, { useState } from 'react';

export interface ScheduledTask { id: string; name: string; prompt: string; cron: string; enabled: boolean; lastRun?: number; nextRun?: number; }

const TaskScheduler: React.FC = () => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([
    { id: 't1', name: '每日摘要', prompt: '总结今天的主要新闻和我关注的行业动态', cron: '0 8 * * *', enabled: false },
    { id: 't2', name: '代码审查提醒', prompt: '检查我今天的 git 提交，给出改进建议', cron: '0 18 * * *', enabled: false },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newCron, setNewCron] = useState('0 9 * * *');

  const toggleTask = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const addTask = () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    setTasks(prev => [...prev, { id: 't' + Date.now(), name: newName, prompt: newPrompt, cron: newCron, enabled: false }]);
    setNewName(''); setNewPrompt(''); setNewCron('0 9 * * *'); setShowAdd(false);
  };

  return (
    <div className="ps-overlay">
      <div className="ps-panel" style={{ height: 440 }}>
        <div className="ps-tabs" style={{ width: 160 }}><div className="ps-tab-header">定时任务</div></div>
        <div className="ps-content">
          <div className="ps-section"><h3>已设定时任务</h3>
            {tasks.map(t => (
              <div key={t.id} className="ps-row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{t.cron} — {t.prompt.slice(0, 40)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div className="ps-toggle" onClick={() => toggleTask(t.id)}><div className={'ps-toggle-knob' + (t.enabled ? ' on' : '')} /></div>
                  <button onClick={() => deleteTask(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              </div>
            ))}
            <button onClick={() => setShowAdd(!showAdd)} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--card)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, width: '100%' }}>
              + 添加定时任务
            </button>
          </div>
          {showAdd && (
            <div className="ps-section">
              <div className="ps-row"><label>任务名</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="每日新闻摘要" /></div>
              <div className="ps-row"><label>Prompt</label><input value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="总结今天的主要新闻" /></div>
              <div className="ps-row"><label>Cron</label><input value={newCron} onChange={e => setNewCron(e.target.value)} placeholder="0 9 * * *" /></div>
              <button onClick={addTask} className="msg-edit-btn">保存</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskScheduler;
