import React from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { openLoginModal, incrementUsage } from '../store/authSlice';

/**
 * 当未登录用户 token 用量达到上限时，输入区上方显示此横幅，
 * 提示用户登录 BitWool 账号以继续使用。
 */
export const AuthBanner: React.FC = () => {
  const d = useAppDispatch();
  const limitReached = useAppSelector(s => s.auth.tokenLimitReached);
  const user = useAppSelector(s => s.auth.user);
  const count = useAppSelector(s => s.auth.tokenUsageCount);

  if (!limitReached || user) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 mb-3 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <span className="text-amber-500 text-sm">⚠</span>
        <div>
          <p className="text-xs font-medium text-foreground">免费额度已用完</p>
          <p className="text-[10px] text-muted-foreground">已使用 {count} 次调用，登录 BitWool 账号后无限制使用</p>
        </div>
      </div>
      <button
        onClick={() => d(openLoginModal())}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        登录账号
      </button>
    </div>
  );
};
