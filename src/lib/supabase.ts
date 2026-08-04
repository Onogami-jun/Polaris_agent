/**
 * supabase.ts — BitWool 统一认证客户端
 * 启文和 Polaris 共享同一个 Supabase 项目: spwishxhydvgqbfchjgj
 * 同一个 auth.users 表 → 在启文注册的账号直接登录 Polaris，反之亦然
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://spwishxhydvgqbfchjgj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hY1a3BqHfPvUNPQwkV6AEg_Nz-b2bgY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** 启动时检查并恢复已有的登录态 */
export async function restoreSession(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) { console.warn('[Auth] Session restore:', error.message); return false; }
    return !!session;
  } catch (e) {
    console.warn('[Auth] Restore failed:', e);
    return false;
  }
}

/** 获取当前用户完整信息（从 user_metadata 获取，不依赖 profiles 表） */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  // Use user_metadata (always available from auth) instead of profiles table
  // This avoids 406 errors when columns/schema don't match
  const meta = (user.user_metadata || {}) as Record<string, any>;
  const displayName = meta.display_name || user.email?.split('@')[0] || 'User';
  const avatar = meta.avatar_color || '#6366f1';
  const plan = (meta.plan || 'free') as 'free' | 'pro' | 'enterprise';

  return {
    id: user.id,
    email: user.email!,
    displayName,
    avatar,
    plan,
    createdAt: user.created_at,
    lastSignIn: user.last_sign_in_at,
  };
}
