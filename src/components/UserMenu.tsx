import React, { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { openLoginModal, logoutUser } from '../store/authSlice';

export const UserMenu: React.FC = () => {
  const d = useAppDispatch();
  const user = useAppSelector(s => s.auth.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function click(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);

  if (!user) {
    return (
      <button
        onClick={() => d(openLoginModal())}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        title="登录 BitWool 账号"
      >
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          </svg>
        </div>
        <span>登录</span>
      </button>
    );
  }

  const initial = user.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-all"
        title={user.email}
      >
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: user.avatar }}>
          {initial}
        </div>
        <span className="text-[11px] text-muted-foreground max-w-[80px] truncate">{user.displayName}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-border bg-card shadow-xl py-1 animate-fade-in z-50">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs font-medium text-foreground">{user.displayName}</div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">{user.email}</div>
          </div>
          <button
            onClick={() => { d(logoutUser()); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
};
