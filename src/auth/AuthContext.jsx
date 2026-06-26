import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isConfigured } from '../supabaseClient'
import { cachedSelect } from '../lib/cache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) return setProfile(null)
    // Cached so the app works (and knows your role) offline.
    const { data } = await cachedSelect(`profile:${userId}`,
      supabase.from('profiles').select('*').eq('id', userId).single())
    setProfile(data ?? null)
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    let active = true
    const done = () => { if (active) setLoading(false) }

    // Read the stored session, then load the profile in the BACKGROUND — never
    // block the app on the network, so it opens instantly even with no signal.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      loadProfile(data.session?.user?.id)
    }).catch(() => {}).finally(done)

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      // User arrived from a "forgot password" email — show the reset screen.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(sess)
      loadProfile(sess?.user?.id)
      done()
    })

    // Hard safety net: never get stuck on the loading screen.
    const fallback = setTimeout(done, 3000)

    return () => {
      active = false
      clearTimeout(fallback)
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isConfigured,
    refreshProfile: () => loadProfile(session?.user?.id),
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }),
    signOut: () => supabase.auth.signOut(),
    // Password management
    passwordRecovery: recovery,
    clearRecovery: () => setRecovery(false),
    updatePassword: (password) => supabase.auth.updateUser({ password }),
    sendPasswordReset: (email) =>
      supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
