import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        else { setProfile(null); setLoading(false) }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single()

    if (data) {
      setProfile(data)
    } else {
      const adminProfile: Profile = {
        id: uid,
        role: 'admin',
        name: 'Admin',
        zone: '',
        commission_direct: 25,
        commission_reseller: 10,
        active: true,
      }
      await supabase.from('profiles').insert(adminProfile)
      setProfile(adminProfile)
    }
    setLoading(false)
  }

  const signIn = async (username: string, password: string) => {
    const email = username.includes('@')
      ? username
      : `${username}@boticario.internal`
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signOut = () => supabase.auth.signOut()

  return { user, profile, loading, signIn, signOut }
}
