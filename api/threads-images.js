module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });

    try {
        // facebookexternalhit UA — Meta 계열이라 Threads 봇 차단 우회
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
            },
            redirect: 'follow',
        });
        const html = await r.text();

        const images = [];
        const videos = [];
        const coupangLinks = [];

        // og:image
        for (const pat of [
            /<meta[^>]+property="og:image[^"]*"[^>]+content="([^"]+)"/gi,
            /<meta[^>]+content="([^"]+)"[^>]+property="og:image[^"]*"/gi,
        ]) {
            for (const m of html.matchAll(pat)) {
                const u = m[1].replace(/&amp;/g, '&');
                if (!images.includes(u)) images.push(u);
            }
        }

        // og:video
        for (const pat of [
            /<meta[^>]+property="og:video[^"]*"[^>]+content="([^"]+)"/gi,
            /<meta[^>]+content="([^"]+)"[^>]+property="og:video[^"]*"/gi,
        ]) {
            for (const m of html.matchAll(pat)) {
                const u = m[1].replace(/&amp;/g, '&');
                if (!videos.includes(u)) videos.push(u);
            }
        }

        // 쿠팡 링크
        for (const m of html.matchAll(/https?:\/\/(?:link\.coupang\.com|www\.coupang\.com|cpang\.me)\/\S+/g)) {
            if (!coupangLinks.includes(m[0])) coupangLinks.push(m[0]);
        }

        if (!images.length && !videos.length) {
            return res.status(200).json({ images, videos, coupangLinks, message: '이미지/영상을 찾을 수 없습니다.' });
        }
        return res.status(200).json({ images, videos, coupangLinks });
    } catch (err) {
        return res.status(200).json({ error: err.message, images: [], videos: [], coupangLinks: [] });
    }
};
