module.exports = async function handler(req, res) {
  const { url, fname } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://www.threads.net/',
        'Accept': '*/*',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `upstream ${upstream.status}`, url });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const isVideo = contentType.includes('video') || url.includes('.mp4') || url.includes('t66.');
    const filename = fname || (isVideo ? 'video.mp4' : 'image.jpg');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', isVideo ? 'video/mp4' : 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
