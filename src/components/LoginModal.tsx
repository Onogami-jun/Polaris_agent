import React, { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { closeLoginModal, clearLoginError, loginUser } from '../store/authSlice';
import { supabase, getCurrentUser } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';

export const LoginModal: React.FC = () => {
  const d = useAppDispatch();
  const show = useAppSelector(s => s.auth.showLoginModal);
  const error = useAppSelector(s => s.auth.loginError);

  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Rate limiting
  const rl = useRef({ lastSend: 0, sendCount: 0, lastLogin: 0 });

  /* ── Verification UI (shared by register + forgot) ── */
  const [vStage, setVStage] = useState<'input'|'code'>('input');
  const [vCode, setVCode] = useState(['','','','','','']);
  const [vError, setVError] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vMode, setVMode] = useState<'register'|'forgot'>('register');
  const vRefs = useRef<(HTMLInputElement|null)[]>([]);

  // Forgot password: reset password UI state
  const[resetStage,setResetStage]=useState<''|'setPwd'>('');
  const[newPwd,setNewPwd]=useState('');
  const[newPwd2,setNewPwd2]=useState('');
  const[resetEmail,setResetEmail]=useState('');

  useEffect(() => { if (!show) { setVStage('input'); setVCode(['','','','','','']); setMsg(''); setVError(''); } }, [show]);

  if (!show) return null;

  const translate = (err: string) => {
    if (err === 'Invalid login credentials') return '邮箱或密码错误。如果忘记了密码，请点击下方"忘记密码"通过邮箱重置。';
    if (err.includes('User already registered')) return '该邮箱已注册。请切换到"登录"标签直接登录。';
    if (err.includes('Email not confirmed')) return '邮箱未确认。请在 Supabase Dashboard 中关闭邮箱确认。';
    if (err.includes('Email rate limit exceeded')) return '请求过于频繁，请稍后再试。';
    if (err.includes('Password should be at least')) return '密码至少需要 6 位字符。';
    if (err.includes('Unable to validate email')) return '邮箱格式不正确。';
    return err;
  };

  /* ── Send code (register or forgot) ── */
    /* Send code (register or forgot) */
  const sendCode = async (mode: 'register'|'forgot') => {
    var now = Date.now();
    if (now - rl.current.lastSend < 60000) { setVError('请 ' + Math.ceil((60000-(now-rl.current.lastSend))/1000) + ' 秒后再试'); return; }
    if (rl.current.sendCount >= 5) { setVError('发送次数已达上限'); return; }
    if (!email.includes('@')) { setVError('请输入有效的邮箱地址'); return; }
    var api = window.electronAPI;
    if (!api) { setVError('请在 Electron 环境中使用'); return; }
    setBusy(true); setVError('');
    rl.current.lastSend = now; rl.current.sendCount += 1;
    try {
      var r;
      if (mode === 'register') {
        // Try signUp directly — Supabase returns error if already registered
        var signUpResult = await supabase.auth.signUp({ email, password, options: { data: { display_name: name || email.split('@')[0] } } });
        if (signUpResult.error) {
          if (signUpResult.error.message && signUpResult.error.message.includes('already registered')) {
            setVError('该邮箱已注册，请直接登录。如果忘记密码，请点击"忘记密码"重置。');
          } else if (signUpResult.error.message && (signUpResult.error.message.includes('Password') || signUpResult.error.message.includes('password'))) {
            setVError('密码至少需要 6 位字符');
          } else {
            setVError(signUpResult.error.message);
          }
          setBusy(false); rl.current.sendCount -= 1; return;
        }
        if (signUpResult.data.session) {
          // Auto-logged in (email confirm is OFF)
          var user = await getCurrentUser();
          if (user && api) await api.authUnlock(user.id);
          d(loginUser({ email, password }));
          d(closeLoginModal());
          setBusy(false); return;
        }
        // No session = email confirm is ON
        setVError('注册请求已提交。请在 Supabase Dashboard 中关闭"Confirm email"，或等待确认邮件。');
        setBusy(false); rl.current.sendCount -= 1; return;
      }
      r = await api.emailForgotPassword(email);
      if (!r) { setVError('服务器无响应，请重试'); setBusy(false); return; }
      if (!r.success || !r.code) { setVError(r.error || '发送失败'); setBusy(false); return; }
      (window as any).__pol_code = r.code;
      setVEmail(email); setVMode(mode); setVStage('code'); setBusy(false);
      setTimeout(function(){ vRefs.current[0]?.focus(); }, 100);
    } catch(e: any) { setVError(e.message || '发送失败'); setBusy(false); }
  };
  const onCode = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    var next = [...vCode]; next[i] = v; setVCode(next);
    if (v && i < 5) vRefs.current[i+1]?.focus();
  };
  const onCodeKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !vCode[i] && i > 0) vRefs.current[i-1]?.focus();
  };

  /* ── Verify and act ── */
  const doVerify = async () => {
    var inCode = vCode.join('');
    if (inCode.length < 6) { setVError('请输入完整验证码'); return; }
    if (inCode !== (window as any).__pol_code) { setVError('验证码不正确'); return; }
    setVError('');
    var api = window.electronAPI;

    if (vMode === 'forgot') {
      // Code correct → show new password form
      setResetEmail(vEmail);
      setVStage('input');
      setResetStage('setPwd');
      delete (window as any).__pol_code;
      return;
    }

    // Register mode: sign up + auto login
    var r = await supabase.auth.signUp({ email: vEmail, password, options: { data: { display_name: name || vEmail.split('@')[0] } } });
    if (r.error) { setVError(translate(r.error.message)); return; }
    if (r.data.session) {
      var user = await getCurrentUser();
      if (user && api) {
        await api.authUnlock(user.id);
        d({ type: 'auth/login/fulfilled' as any, payload: user } as any);
      }
      if (api) api.emailSendWelcome(vEmail, name || '').catch(function(){});
    }
    setVStage('input'); setMsg('注册成功！'); setTimeout(function(){ setMsg(''); }, 2000);
    delete (window as any).__pol_code;
  };

  /* ── Set new password after forgot-password verification ── */
  const doResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPwd || newPwd.length < 6) { setVError('新密码至少 6 位'); return; }
    if (newPwd !== newPwd2) { setVError('两次密码不一致'); return; }
    setBusy(true); setVError('');
    try {
      // Call admin API via main process (uses service_role key)
      var api = window.electronAPI;
      if (!api) throw new Error('请在 Electron 环境中使用');
      var result = await api.authAdminResetPassword(resetEmail, newPwd);
      if (!result.success) { setVError(result.error || '重置失败'); setBusy(false); return; }
      setMsg('密码重置成功！请切换到"登录"标签用新密码登录。');
      setResetStage(''); setNewPwd(''); setNewPwd2(''); setResetEmail('');
      // Auto-switch to login tab
      setTab('login');
    } catch(e: any) { setVError(e.message || '重置失败'); }
    setBusy(false);
  };

  /* ── Handle login ── */
  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 6) return;
    var now = Date.now();
    if (now - rl.current.lastLogin < 3000) return;
    rl.current.lastLogin = now;
    // Try login
    var result = await d(loginUser({ email, password }));
    // After login, unlock API key
    var user = await getCurrentUser();
    if (user) {
      var api = window.electronAPI;
      if (api) api.authUnlock(user.id);
    }
  };

  /* ── Handle register ── */
  const doRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 6) return;
    sendCode('register');
  };

  /* ── Handle forgot ── */
  const doForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    sendCode('forgot');
  };

  /* ═══════════════ SET NEW PASSWORD (after forgot code verified) ═══════════════ */
  if (resetStage === 'setPwd') {
    return (
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => d(closeLoginModal())}>
        <div className="w-[400px] max-w-[92vw] rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center text-2xl">🔑</div>
              <h3 className="text-lg font-semibold text-foreground">设置新密码</h3>
              <p className="text-xs text-muted-foreground mt-1">为 <b className="text-foreground">{resetEmail}</b> 设置新密码</p>
            </div>
            {vError && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">{vError}</div>}
            {msg && <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-600">{msg}</div>}
            <form onSubmit={doResetPassword} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">新密码</label>
                <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="至少 6 位" className="h-10" autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">确认新密码</label>
                <Input type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} placeholder="再次输入" className="h-10" />
              </div>
              <Button type="submit" className="h-10 w-full mt-1" disabled={busy || !newPwd || newPwd.length < 6 || newPwd !== newPwd2}>
                {busy ? '重置中...' : '重置密码'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════ CODE VERIFICATION STEP ═══════════════ */
  if (vStage === 'code') {
    return (
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => d(closeLoginModal())}>
        <div className="w-[400px] max-w-[92vw] rounded-2xl border border-border bg-card shadow-2xl p-8" onClick={e => e.stopPropagation()}>
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center text-2xl">{vMode === 'register' ? '✉️' : '🔐'}</div>
            <h3 className="text-lg font-semibold text-foreground">输入验证码</h3>
            <p className="text-xs text-muted-foreground mt-1">已发送至 <b className="text-foreground">{vEmail}</b></p>
          </div>
          {vError && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive mb-4">{vError}</div>}
          <div className="flex gap-2 justify-center mb-6">
            {vCode.map((d, i) => (
              <input key={i} ref={el => { vRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
                onChange={e => onCode(i, e.target.value)} onKeyDown={e => onCodeKey(i, e)}
                className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-border bg-muted text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"/>
            ))}
          </div>
          <Button onClick={doVerify} className="w-full h-10" disabled={vCode.join('').length < 6}>验证</Button>
          <p className="text-[10px] text-muted-foreground text-center mt-4 space-x-4">
            <button className="hover:text-foreground" onClick={() => { var api = window.electronAPI; if (api) { vMode === 'register' ? sendCode('register') : sendCode('forgot'); } }}>重新发送</button>
            <button className="hover:text-foreground" onClick={() => { setVStage('input'); setVError(''); }}>返回</button>
          </p>
        </div>
      </div>
    );
  }

  /* ═══════════════ MAIN FORM ═══════════════ */
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => d(closeLoginModal())}>
      <div className="w-[400px] max-w-[92vw] rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex border-b border-border">
          <button className={'flex-1 py-3.5 text-sm font-medium transition-colors ' + (tab==='login'?'text-foreground border-b-2 border-primary':'text-muted-foreground hover:text-foreground')} onClick={()=>{setTab('login');d(clearLoginError());setMsg('');}}>登录</button>
          <button className={'flex-1 py-3.5 text-sm font-medium transition-colors ' + (tab==='register'?'text-foreground border-b-2 border-primary':'text-muted-foreground hover:text-foreground')} onClick={()=>{setTab('register');d(clearLoginError());setMsg('');}}>注册</button>
        </div>

        <form onSubmit={tab==='login'?doLogin:tab==='register'?doRegister:doForgot} className="p-6 flex flex-col gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold font-mono">BitWool</div>
            <p className="text-xs text-muted-foreground mt-1">{tab==='login'?'登录 BitWool 账号':tab==='register'?'注册并验证邮箱':'重置密码'}</p>
          </div>

          {error && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">{translate(error)}</div>}
          {msg && <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-600">{msg}</div>}

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

          {tab !== 'forgot' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">密码</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" className="h-10" />
            </div>
          )}

          <Button type="submit" className="h-10 w-full mt-1" disabled={!email.includes('@') || (tab!=='forgot'&&password.length<6) || (tab==='register'&&!name.trim()) || busy}>
            {busy?'发送中...':tab==='login'?'登录':tab==='register'?'发送验证码':'发送重置验证码'}
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            {tab === 'login' && <><span>还没有账号？</span><button type="button" className="text-primary hover:underline ml-1" onClick={()=>{setTab('register');d(clearLoginError());}}>立即注册</button></>}
            {tab === 'register' && <><span>已有账号？</span><button type="button" className="text-primary hover:underline ml-1" onClick={()=>{setTab('login');d(clearLoginError());}}>去登录</button></>}
            {tab === 'forgot' && <button type="button" className="text-primary hover:underline" onClick={()=>{setTab('login');d(clearLoginError());}}>返回登录</button>}
            {tab === 'login' && <button type="button" className="text-primary hover:underline ml-3" onClick={()=>{setTab('forgot');d(clearLoginError());}}>忘记密码？</button>}
          </p>
        </form>
      </div>
    </div>
  );
};
