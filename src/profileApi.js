import { supabase } from './supabase'

export const ADMIN_EMAIL = 'qafarzadep@gmail.com'
export const ADMIN_PUBLIC_NAME = 'BilX Admin'

export function fallbackProfile(user) {
  if (!user) return null

  return {
    user_id: user.id,
    full_name: user.user_metadata?.full_name || user.email,
    role: 'student',
  }
}

async function hasApprovedTeacherApplication(user) {
  const { data, error } = await supabase
    .from('teacher_applications')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .limit(1)

  if (error) return false
  return (data || []).length > 0
}

async function withApprovedTeacherRole(user, profile) {
  if (!profile || profile.role === 'instructor') return profile
  const approved = await hasApprovedTeacherApplication(user)
  return approved ? { ...profile, role: 'instructor' } : profile
}

export async function ensureProfile(user) {
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (data) return withApprovedTeacherRole(user, data)

  // Never recreate a profile from a stale JWT after an administrator has
  // deleted the underlying Auth account.
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || authData.user?.id !== user.id) return null

  const profile = fallbackProfile(user)
  const { data: inserted } = await supabase
    .from('profiles')
    .insert(profile)
    .select()
    .single()

  return withApprovedTeacherRole(user, inserted || profile)
}

export function isAdmin(user) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL
}
