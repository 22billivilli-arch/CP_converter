module.exports = async function handler(req, res) {
  const { url, fname } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const cleanUrl = url.replace(/&amp;/g, '&').replace(/&#038;/g, '&');
    // CDN 호스트별 Referer (없으면 403)
    let referer = 'https://www.threads.net/';
    if (/xhscdn|xiaohongshu/i.test(cleanUrl)) referer = 'https://www.xiaohongshu.com/';
    else if (/tiktok|tikcdn|byteic|muscdn|tiktokcdn/i.test(cleanUrl)) referer = 'https://www.tiktok.com/';
    const upstream = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Referer': referer,
        'Accept': '*/*',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `upstream ${upstream.status}`, url });
    }

    const upType = (upstream.headers.get('content-type') || '').split(';')[0].trim();
    // CDN content-type을 신뢰. 없으면 URL로 추정 (Threads 영상은 .mp4 없이 o1/v/t16 형태)
    let outType = upType;
    if (!outType || outType === 'application/octet-stream') {
      const isVid = url.includes('.mp4') || /\/v\/t\d|t66\.|t16\.|\/o1\/v\//.test(url);
      outType = isVid ? 'video/mp4' : 'image/jpeg';
    }
    const isVideo = outType.startsWith('video');
    const filename = fname || (isVideo ? 'video.mp4' : 'image.jpg');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', outType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// 큰 영상 서빙 대비 실행시간 상향
module.exports.config = { maxDuration: 60 };
