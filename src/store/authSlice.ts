import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { supabase, getCurrentUser } from '../lib/supabase';

/* ── 类型 ──────────────────────────────────────── */
export interface PolarUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  lastSignIn: string | null;
}

interface AuthState {
  user: PolarUser | null;
  loading: boolean;
  showLoginModal: boolean;
  loginError: string | null;
  tokenUsageCount: number;
  tokenLimitReached: boolean;
}

/* ── 阈值 ───────────────────────────────────────── */
const FREE_TOKEN_LIMIT = 50;

function loadUsageCount(): number {
  try { return parseInt(localStorage.getItem('polaris_usage_count') || '0', 10) || 0; }
  catch { return 0; }
}
function saveUsageCount(n: number) { localStorage.setItem('polaris_usage_count', String(n)); }

/* ── Async thunks ──────────────────────────────── */
export const restoreAuth = createAsyncThunk('auth/restore', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return getCurrentUser();
});

export const loginUser = createAsyncThunk('auth/login', async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return rejectWithValue(error.message);
  return getCurrentUser();
});

export const registerUser = createAsyncThunk('auth/register', async ({ email, password, displayName }: { email: string; password: string; displayName: string }, { rejectWithValue }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return rejectWithValue(error.message);
  // 新建 profile
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      display_name: displayName,
      avatar_color: '#6366f1',
      plan: 'free',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }
  // 注册完自动登录态成立
  return getCurrentUser();
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  await supabase.auth.signOut();
});

/* ── Slice ──────────────────────────────────────── */
const initialState: AuthState = {
  user: null,
  loading: false,
  showLoginModal: false,
  loginError: null,
  tokenUsageCount: loadUsageCount(),
  tokenLimitReached: loadUsageCount() >= FREE_TOKEN_LIMIT,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    openLoginModal: (s) => { s.showLoginModal = true; s.loginError = null; },
    closeLoginModal: (s) => { s.showLoginModal = false; s.loginError = null; },
    incrementUsage: (s) => {
      s.tokenUsageCount += 1;
      saveUsageCount(s.tokenUsageCount);
      if (s.tokenUsageCount >= FREE_TOKEN_LIMIT && !s.user) {
        s.tokenLimitReached = true;
      }
    },
    resetUsage: (s) => { s.tokenUsageCount = 0; s.tokenLimitReached = false; saveUsageCount(0); },
    clearLoginError: (s) => { s.loginError = null; },
  },
  extraReducers: (builder) => {
    // Restore
    builder.addCase(restoreAuth.pending, (s) => { s.loading = true; });
    builder.addCase(restoreAuth.fulfilled, (s, a: PayloadAction<PolarUser | null>) => {
      s.loading = false; s.user = a.payload; if (a.payload) s.tokenLimitReached = false;
    });
    builder.addCase(restoreAuth.rejected, (s) => { s.loading = false; });
    // Login
    builder.addCase(loginUser.pending, (s) => { s.loginError = null; });
    builder.addCase(loginUser.fulfilled, (s, a: PayloadAction<PolarUser | null>) => {
      s.user = a.payload; s.showLoginModal = false; s.tokenLimitReached = false;
    });
    builder.addCase(loginUser.rejected, (s, a) => { s.loginError = a.payload as string; });
    // Register
    builder.addCase(registerUser.pending, (s) => { s.loginError = null; });
    builder.addCase(registerUser.fulfilled, (s, a: PayloadAction<PolarUser | null>) => {
      s.user = a.payload; s.showLoginModal = false; s.tokenLimitReached = false;
    });
    builder.addCase(registerUser.rejected, (s, a) => { s.loginError = a.payload as string; });
    // Logout
    builder.addCase(logoutUser.fulfilled, (s) => { s.user = null; });
  },
});

export const { openLoginModal, closeLoginModal, incrementUsage, resetUsage, clearLoginError } = authSlice.actions;
export default authSlice.reducer;
