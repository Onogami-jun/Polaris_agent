/**
 * supabase.ts — BitWool 统一认证客户端
 * 启文的 Supabase 项目，Polaris 直接复用，账号互通
 *
 * 获取 ANON_KEY：
 *   打开 https://supabase.com/dashboard/project/spwishxhydvgqbfchjgj/settings/api
 *   左边栏 Project Settings → API → anon public key
 *   复制下面那段 eyJ... 开头的长字符串，替换掉 YOUR_ANON_KEY
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

/** 检查并恢复已有的登录态（Electron 重启后自动登录） */
export async function restoreSession(): Promise<boolean> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) { console.warn('[Auth] Session restore error:', error.message); return false; }
  return !!session;
}

/** 获取当前用户完整信息 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_color, plan')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email!,
    displayName: profile?.display_name || user.email?.split('@')[0] || 'User',
    avatar: profile?.avatar_color || '#6366f1',
    plan: profile?.plan || 'free',
    createdAt: user.created_at,
    lastSignIn: user.last_sign_in_at,
  };
}
