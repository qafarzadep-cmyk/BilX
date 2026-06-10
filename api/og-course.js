// Rich link previews for shared course links.
//
// BilX is a client-rendered SPA, so a link crawler (WhatsApp, Telegram,
// Facebook, etc.) only ever sees the generic index.html — no per-course title
// or image. This endpoint serves crawlers a tiny HTML document carrying the
// course's own Open Graph tags so shared links unfurl with the right
// thumbnail/title/description.
//
// It is reached ONLY for crawler user-agents, via a `has` condition in
// vercel.json — real browsers fall through to the normal SPA, completely
// untouched. If anything here fails, it returns generic (but valid) tags, so a
// preview is never broken.

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildHtml({ url, title, description, image }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeUrl = escapeHtml(url)
  const imageTags = image
    ? `<meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />`
    : `<meta name="twitter:card" content="summary" />`

  return `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="BilX" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDescription}" />
<meta property="og:url" content="${safeUrl}" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDescription}" />
${imageTags}
<link rel="canonical" href="${safeUrl}" />
</head>
<body>
<h1>${safeTitle}</h1>
<p>${safeDescription}</p>
<p><a href="${safeUrl}">${safeUrl}</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'bilx.org'
  // Course ids are bigint — keep only digits, so the value is safe to interpolate.
  const id = `${req.query?.id || ''}`.replace(/[^0-9]/g, '')
  const url = `https://${host}/course/${id}`

  const fallbackHtml = () => buildHtml({
    url,
    title: 'BilX — Onlayn video kurslar',
    description: 'Azərbaycan dilində peşəkar video kurslar.',
    image: null,
  })

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Cache at the edge so repeated crawler hits don't re-query Supabase.
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')

  const supabaseUrl = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!id || !supabaseUrl || !key) {
    res.status(200).send(fallbackHtml())
    return
  }

  try {
    // Only published courses get a custom preview (the filter restricts it even
    // though the service role bypasses RLS).
    const apiUrl = `${supabaseUrl}/rest/v1/Courses?id=eq.${id}&is_published=eq.true&select=title,description,thumbnail_url&limit=1`
    const response = await fetch(apiUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    const rows = response.ok ? await response.json() : []
    const course = Array.isArray(rows) ? rows[0] : null

    if (!course) {
      res.status(200).send(fallbackHtml())
      return
    }

    res.status(200).send(buildHtml({
      url,
      title: `${course.title} · BilX`,
      description: course.description || 'Azərbaycan dilində peşəkar video kurs.',
      image: course.thumbnail_url || null,
    }))
  } catch {
    res.status(200).send(fallbackHtml())
  }
}
