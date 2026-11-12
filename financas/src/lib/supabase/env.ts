export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** true quando as variáveis do Supabase foram configuradas em .env.local */
export const isSupabaseConfigured = () =>
  /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_URL.includes("SEU-PROJETO");
