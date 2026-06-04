export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const upstream = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.threads.net/',
      },
    });
    if (!upstream.ok) return res.status(upstream.status).end();

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const isVideo = contentType.includes('video') || url.includes('.mp4');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', isVideo ? 'video/mp4' : contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${isVideo ? 'video.mp4' : 'image.jpg'}"`);

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
