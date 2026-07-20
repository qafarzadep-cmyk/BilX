function getCdnUrl(videoId) {
  const cdnHostname = (process.env.BUNNY_CDN_HOSTNAME || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!cdnHostname) return ''
  return `https://${cdnHostname}/${encodeURIComponent(videoId)}/thumbnail.jpg`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const videoId = String(req.query?.videoId || '').trim()
  if (!/^[a-f0-9-]{32,40}$/i.test(videoId)) {
    res.status(400).json({ error: 'Invalid video id.' })
    return
  }

  const thumbnailUrl = getCdnUrl(videoId)
  if (!thumbnailUrl) {
    res.status(500).json({ error: 'Bunny CDN is not configured.' })
    return
  }

  try {
    const response = await fetch(thumbnailUrl)
    if (!response.ok) {
      res.status(response.status).json({ error: 'Thumbnail not ready.' })
      return
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    res.status(200).send(buffer)
  } catch {
    res.status(502).json({ error: 'Could not load thumbnail.' })
  }
}
