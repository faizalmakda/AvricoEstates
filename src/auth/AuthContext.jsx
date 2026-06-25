import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isConfigured } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) return setProfile(null)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      // User arrived from a "forgot password" email — show the reset screen.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(sess)
      await loadProfile(sess?.user?.id)
    })

    return () => {
      active = false
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
