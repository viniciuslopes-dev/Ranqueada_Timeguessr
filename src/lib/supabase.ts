import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export async function ensureAnonymousSession() {
  if (!supabase) return

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) {
    const result = await supabase.auth.signInAnonymously()
    if (result.error) throw result.error
  }
}
