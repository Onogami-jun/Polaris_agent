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

/** 获取当前用户完整信息（兼容无 profiles 表的情况） */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  let displayName = user.email?.split('@')[0] || 'User';
  let avatar = '#6366f1';
  let plan = 'free';

  // profiles 表是可选的——不存在也不应该阻断登录
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_color, plan')
      .eq('id', user.id)
      .single();
    if (profile) {
      displayName = profile.display_name || displayName;
      avatar = profile.avatar_color || avatar;
      plan = profile.plan || plan;
    }
  } catch {
    // profiles 表不存在 — 用默认值，登录正常进行
  }

  return {
    id: user.id,
    email: user.email!,
    displayName,
    avatar,
    plan: plan as 'free' | 'pro' | 'enterprise',
    createdAt: user.created_at,
    lastSignIn: user.last_sign_in_at,
  };
}
