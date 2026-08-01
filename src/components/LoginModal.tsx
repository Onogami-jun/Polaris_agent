import React, { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { closeLoginModal, clearLoginError, loginUser } from '../store/authSlice';
import { supabase } from '../lib/supabase';
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

  // Verification flow
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [verifyCode, setVerifyCode] = useState(['','','','','','']);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const [pendingName, setPendingName] = useState('');
  const verifyInputs = useRef<(HTMLInputElement|null)[]>([]);

  // Reset stage when closing
  useEffect(() => { if (!show) { setStage('form'); setVerifyCode(['','','','','','']); } }, [show]);

  if (!show) return null;

  const translateError = (err: string) => {
    if (err === 'Invalid login credentials') return '邮箱或密码错误';
    if (err === 'User already registered') return '该邮箱已注册，请直接登录';
    if (err === 'Email rate limit exceeded') return '请求过于频繁，请稍后再试';
    if (err.includes('Email not confirmed')) return '邮箱未验证。请在 Supabase Dashboard 关闭邮箱确认。';
    return err;
  };

  /* ── Handle code input ───────────────────────────────── */
  const onCodeInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...verifyCode];
    next[index] = value;
    setVerifyCode(next);
    // Auto-focus next input
    if (value && index < 5) verifyInputs.current[index + 1]?.focus();
  };

  const onCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verifyCode[index] && index > 0) {
      verifyInputs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      verifyAndLogin();
    }
  };

  /* ── Send verification code ──────────────────────────── */
  const sendCode = async () => {
    const api = window.electronAPI;
    if (!api) { setCodeError('请在 Electron 环境中使用'); return; }

    setSendingCode(true);
    setCodeError('');
    try {
      const r = await api.emailSendCode(email);
      if (!r.success) { setCodeError(r.error || '发送失败'); setSendingCode(false); return; }
      // Store code for local verification
      (window as any).__polaris_verify_code = r.code;
      (window as any).__polaris_verify_email = email;
      setPendingEmail(email);
      setPendingPassword(password);
      setPendingName(name.trim());
      setStage('verify');
      setSendingCode(false);
      setTimeout(() => verifyInputs.current[0]?.focus(), 100);
    } catch (e: any) {
      setCodeError(e.message || '发送失败');
      setSendingCode(false);
    }
  };

  /* ── Verify code and complete registration ───────────── */
  const verifyAndLogin = async () => {
    const entered = verifyCode.join('');
    const stored = (window as any).__polaris_verify_code;
    if (entered.length < 6) { setCodeError('请输入完整验证码'); return; }
    if (entered !== stored) { setCodeError('验证码不正确'); return; }

    setCodeError('');
    const storedEmail = (window as any).__polaris_verify_email;

    // Call Supabase signUp (this time with email_confirm: false in mind)
    // If email confirmation is required by Supabase, signUp still succeeds but user isn't auto-logged in
    const { error: signUpErr } = await supabase.auth.signUp({
      email: storedEmail || pendingEmail,
      password: pendingPassword,
      options: { data: { display_name: pendingName || storedEmail?.split('@')[0] } },
    });

    if (signUpErr) {
      setCodeError(translateError(signUpErr.message));
      return;
    }

    // Auto-login after registration
    d(loginUser({ email: storedEmail || pendingEmail, password: pendingPassword }));

    // Send welcome email
    const api = window.electronAPI;
    if (api) {
      api.emailSendWelcome(storedEmail || pendingEmail, pendingName || '').catch(function(){});
    }

    // Cleanup
    delete (window as any).__polaris_verify_code;
    delete (window as any).__polaris_verify_email;
    setStage('form');
  };

  /* ── Register button handler ─────────────────────────── */
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 6) return;
    sendCode();
  };

  /* ── Login handler ───────────────────────────────────── */
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 6) return;
    d(loginUser({ email, password }));
  };

  /* ══════════════ VERIFICATION CODE STEP ═══════════════ */
  if (stage === 'verify') {
    return (
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={() => d(closeLoginModal())}>
        <div className="w-[400px] max-w-[92vw] rounded-2xl border border-border bg-card shadow-2xl p-8" onClick={e => e.stopPropagation()}>
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                <polyline points="1,6 8,10 15,6"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">输入验证码</h3>
            <p className="text-xs text-muted-foreground mt-1">验证码已发送至 <b className="text-foreground">{pendingEmail}</b></p>
          </div>

          {codeError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive mb-4">{codeError}</div>
          )}

          <div className="flex gap-2 justify-center mb-6">
            {verifyCode.map((digit, i) => (
              <input
                key={i}
                ref={el => { verifyInputs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => onCodeInput(i, e.target.value)}
                onKeyDown={e => onCodeKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-border bg-muted text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ))}
          </div>

          <Button onClick={verifyAndLogin} className="w-full h-10" disabled={verifyCode.join('').length < 6}>
            验证并注册
          </Button>

          <p className="text-[10px] text-muted-foreground text-center mt-4 space-x-4">
            <button type="button" className="hover:text-foreground" onClick={sendCode}>{sendingCode ? '重新发送中...' : '重新发送'}</button>
            <button type="button" className="hover:text-foreground" onClick={() => { setStage('form'); setCodeError(''); }}>返回</button>
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════ LOGIN / REGISTER FORM ═══════════════ */
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={() => d(closeLoginModal())}>
      <div className="w-[400px] max-w-[92vw] rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
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

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="p-6 flex flex-col gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold font-mono">BitWool</div>
            <p className="text-xs text-muted-foreground mt-1">{tab === 'login' ? '登录你的 BitWool 账号' : '创建 BitWool 账号，验证码发送至你的邮箱'}</p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {translateError(error)}
              {error === 'Invalid login credentials' && <p className="mt-1 text-[10px] opacity-70">如果还没注册，请切换到"注册"标签创建账号</p>}
            </div>
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
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" className="h-10" />
          </div>

          {tab === 'login' ? (
            <Button type="submit" className="h-10 w-full mt-1" disabled={!email.includes('@') || password.length < 6}>
              登录
            </Button>
          ) : (
            <Button type="submit" className="h-10 w-full mt-1" disabled={!email.includes('@') || password.length < 6 || !name.trim()}>
              {sendingCode ? '发送中...' : '发送验证码'}
            </Button>
          )}

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
