-- ═══════════════════════════════════════════════════════
-- Polaris + 启文 — Supabase 建表 SQL
-- 在 Supabase SQL Editor 里执行此文件
-- ═══════════════════════════════════════════════════════

-- 1. profiles 扩展表（如果启文已经创建过，跳过这一步）
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_color text default '#6366f1',
  plan        text default 'free' check (plan in ('free', 'pro', 'enterprise')),
  updated_at  timestamptz default now()
);

-- 2. RLS 策略：用户只能读写自己的 profile
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- 3. 注册时自动创建 profile（trigger）
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_color, plan)
  values (new.id, new.raw_user_meta_data ->> 'display_name', '#6366f1', 'free');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Polaris 对话表（云端同步）
create table if not exists public.polaris_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  messages   jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.polaris_conversations enable row level security;

drop policy if exists "Users can read own conversations" on public.polaris_conversations;
create policy "Users can read own conversations" on public.polaris_conversations
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own conversations" on public.polaris_conversations;
create policy "Users can insert own conversations" on public.polaris_conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversations" on public.polaris_conversations;
create policy "Users can update own conversations" on public.polaris_conversations
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own conversations" on public.polaris_conversations;
create policy "Users can delete own conversations" on public.polaris_conversations
  for delete using (auth.uid() = user_id);

-- 5. Polaris 设置表（云端同步 API Key / 偏好）
create table if not exists public.polaris_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  api_keys    jsonb default '{}',
  preferences jsonb default '{}',
  updated_at  timestamptz default now()
);

alter table public.polaris_settings enable row level security;

drop policy if exists "Users can read own settings" on public.polaris_settings;
create policy "Users can read own settings" on public.polaris_settings
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own settings" on public.polaris_settings;
create policy "Users can insert own settings" on public.polaris_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own settings" on public.polaris_settings;
create policy "Users can update own settings" on public.polaris_settings
  for update using (auth.uid() = user_id);
