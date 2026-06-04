import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@3.5.0'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Only allow http(s) links in emails; reject javascript:, data:, etc.
function safeLink(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {
    return null
  }
  return null
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const adminEmail = Deno.env.get('ADMIN_EMAIL')

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Supabase env vars are missing.')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is missing.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const payload = await req.json().catch(() => null)
  if (!payload?.type) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { type, courseTitle, instructorId, link, email } = payload

  const subjectMap = {
    enroll: 'Bil-X: Yeni qeydiyyat',
    comment: 'Bil-X: Yeni şərh',
    rating: 'Bil-X: Yeni reytinq',
    inbox: 'Bil-X: Yeni inbox mesajı',
    teacher_approved: 'Bil-X: Müəllim statusunuz təsdiqləndi 🎉',
    enroll_student: 'Bil-X: Kursa girişiniz açıldı',
  }

  const bodyMap = {
    enroll: courseTitle ? `${courseTitle} kursu üçün yeni qeydiyyat var.` : 'Yeni qeydiyyat var.',
    comment: courseTitle ? `${courseTitle} kursunda yeni şərh var.` : 'Yeni şərh var.',
    rating: courseTitle ? `${courseTitle} kursu üçün yeni reytinq var.` : 'Yeni reytinq var.',
    inbox: 'Sizə yeni inbox mesajı gəldi.',
    teacher_approved: 'Təbriklər! Artıq Bil-X-də müəllim kimi dərslərinizi paylaşa bilərsiniz.',
    enroll_student: courseTitle
      ? `${courseTitle} kursuna girişiniz açıldı. Öyrənməyə başlaya bilərsiniz!`
      : 'Kursa girişiniz açıldı. Öyrənməyə başlaya bilərsiniz!',
  }

  const subject = subjectMap[type] || 'Bil-X bildirişi'
  const message = bodyMap[type] || 'Yeni bildiriş var.'

  // Direct-recipient types email the target address (the approved teacher / the
  // enrolled student). They are still behind the auth gate above, so only a
  // logged-in user (the admin) can trigger them — no open spam vector.
  const directTypes = ['teacher_approved', 'enroll_student']

  const recipients = new Set()
  if (directTypes.includes(type)) {
    if (email) recipients.add(email)
  } else {
    if (adminEmail) recipients.add(adminEmail)

    if (instructorId) {
      const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)
      const { data: application } = await adminClient
        .from('teacher_applications')
        .select('email')
        .eq('user_id', instructorId)
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (application?.email) {
        recipients.add(application.email)
      }
    }
  }

  if (recipients.size === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const resend = new Resend(resendApiKey)
  const linkHref = safeLink(link)
  const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111;">
        <h2>${escapeHtml(subject)}</h2>
        <p>${escapeHtml(message)}</p>
        ${linkHref ? `<p><a href="${escapeHtml(linkHref)}">Keçid</a></p>` : ''}
      </div>
    `

  try {
    for (const to of recipients) {
      await resend.emails.send({
        from: 'Bil-X <no-reply@bilx.org>',
        to,
        subject,
        html,
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
