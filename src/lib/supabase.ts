/**
 * supabase.ts — BitWool 统一认证客户端
 * Polaris 复用启文的 Supabase 项目，共享用户体系
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://spwishxhydvgqbfchjgj.supabase.co';

// 获取 key 的优先级：
//   1. 构建时 webpack DefinePlugin 注入的 process.env
//   2. 下面的硬编码（如果启文项目不在同一台机器上，直接在下面填）
//      → 去 https://supabase.com/dashboard/project/spwishxhydvgqbfchjgj/settings/api
//      → 复制 "anon public" key
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwd2lzaHh5ZHZncWJmY2hqZ2oiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcxMzg0MjQ5NywiZXhwIjoyMDI5NDE4NDk3fQ._PLACEHOLDER_FILL_ME_IN';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** 检查 session 是否已过期并尝试恢复 */
export async function restoreSession(): Promise<boolean> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) { console.warn('[Auth] Session restore error:', error.message); return false; }
  return !!session;
}

/** 获取当前用户（含自定义 display_name / avatar / plan） */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  // 拉取 profile 扩展字段
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
