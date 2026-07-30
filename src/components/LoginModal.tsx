import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { closeLoginModal, clearLoginError, loginUser, registerUser } from '../store/authSlice';
import { Button } from './ui/button';
import { Input } from './ui/input';

export const LoginModal: React.FC = () => {
  const d = useAppDispatch();
  const show = useAppSelector(s => s.auth.showLoginModal);
  const error = useAppSelector(s => s.auth.loginError);

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  if (!show) return null;

  const isValid = email.includes('@') && password.length >= 8 && (tab === 'login' || name.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    if (tab === 'login') {
      d(loginUser({ email, password }));
    } else {
      d(registerUser({ email, password, displayName: name.trim() }));
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={() => d(closeLoginModal())}>
      <div className="w-[400px] max-w-[92vw] rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            className={'flex-1 py-3.5 text-sm font-medium transition-colors ' + (tab === 'login' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => { setTab('login'); d(clearLoginError()); }}
          >登录</button>
          <button
            className={'flex-1 py-3.5 text-sm font-medium transition-colors ' + (tab === 'register' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => { setTab('register'); d(clearLoginError()); }}
          >注册</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold font-mono">BitWool</div>
            <p className="text-xs text-muted-foreground mt-1">{tab === 'login' ? '登录你的 BitWool 账号' : '创建 BitWool 账号'}</p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">{error}</div>
          )}

          {tab === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">显示名称</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="你的名字" className="h-10" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">邮箱</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="h-10" autoFocus />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">密码</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 8 位" className="h-10" />
          </div>

          <Button type="submit" className="h-10 w-full mt-1" disabled={!isValid}>
            {tab === 'login' ? '登录' : '注册'}
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            {tab === 'login' ? '还没有账号？' : '已有账号？'}
            <button type="button" className="text-primary hover:underline ml-1" onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); d(clearLoginError()); }}>
              {tab === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};
