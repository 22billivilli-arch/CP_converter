function extractShortcode(url) {
    const m = url.match(/\/post\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

async function findMediaId(token, shortcode) {
    try {
        const me = await (await fetch(
            `https://graph.threads.net/v1.0/me?fields=id&access_token=${token}`
        )).json();
        if (!me.id) return null;
        let after = null;
        for (let page = 0; page < 5; page++) {
            let ep = `https://graph.threads.net/v1.0/${me.id}/threads?fields=id,permalink&limit=25&access_token=${token}`;
            if (after) ep += `&after=${after}`;
            const d = await (await fetch(ep)).json();
            if (d.error) break;
            const hit = (d.data || []).find(p => p.permalink && p.permalink.includes(`/post/${shortcode}`));
            if (hit) return hit.id;
            after = d.paging?.cursors?.after;
            if (!after) break;
        }
    } catch (_) {}
    return null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });

    // 토큰: 클라이언트 전달값 또는 서버 기본값
    const token = req.body.token ||
        'THAALYAgagxE1BYlpnVlJwSnc0dmFzOTdTTzl2UGFfVHQ3U3JBaTBhZATlFeVhWaFZAfbTJfa1hpNDFwc3IwU0pWc2pISExKNmpOSWNzSXkwVEtYbk04UWpoSlN1b0ZAwQVBOU2x6QzNfbW13Mmp3TmdITGhaU2Y3TVBxQ1ZAmVmNhOVdmanF0d0NhdFNZAQ3lTaUUZD';

    // 1. Graph API — 영상 포함 정확히 추출
    if (token) {
        try {
            const sc  = extractShortcode(url);
            const mid = sc ? await findMediaId(token, sc) : null;
            if (mid) {
                const d = await (await fetch(
                    `https://graph.threads.net/v1.0/${mid}?fields=id,media_type,media_url,thumbnail_url&access_token=${token}`
                )).json();
                if (!d.error && d.media_type) {
                    const images = [], videos = [], coupangLinks = [];
                    if (d.media_type === 'CAROUSEL_ALBUM') {
                        const cd = await (await fetch(
                            `https://graph.threads.net/v1.0/${mid}/children?fields=id,media_type,media_url,thumbnail_url&access_token=${token}`
                        )).json();
                        for (const c of (cd.data || [])) {
                            if (!c.media_url) continue;
                            (c.media_type === 'VIDEO' ? videos : images).push(c.media_url);
                        }
                    } else if (d.media_url) {
                        (d.media_type === 'VIDEO' ? videos : images).push(d.media_url);
                    }
                    if (images.length || videos.length)
                        return res.status(200).json({ images, videos, coupangLinks });
                }
            }
        } catch (_) {}
    }

    // 2. LinkedInBot UA로 HTML 파싱 (이미지 추출)
    try {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'LinkedInBot/1.0 (compatible; compatible; http://www.linkedin.com/help/linkedin)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
            },
            redirect: 'follow',
        });
        const html = await r.text();

        const images = [], videos = [], coupangLinks = [], seen = new Set();
        const add = (arr, u) => { if (u && u.startsWith('http') && !seen.has(u)) { seen.add(u); arr.push(u); } };

        for (const pat of [
            /<meta[^>]+property="og:image[^"]*"[^>]+content="([^"]+)"/gi,
            /<meta[^>]+content="([^"]+)"[^>]+property="og:image[^"]*"/gi,
        ]) for (const m of html.matchAll(pat)) add(images, m[1].replace(/&amp;/g, '&'));

        for (const pat of [
            /<meta[^>]+property="og:video[^"]*"[^>]+content="([^"]+)"/gi,
            /<meta[^>]+content="([^"]+)"[^>]+property="og:video[^"]*"/gi,
        ]) for (const m of html.matchAll(pat)) add(videos, m[1].replace(/&amp;/g, '&'));

        for (const m of html.matchAll(/https?:\/\/(?:link\.coupang\.com|www\.coupang\.com|cpang\.me)\/\S+/g))
            if (!coupangLinks.includes(m[0])) coupangLinks.push(m[0]);

        if (!images.length && !videos.length)
            return res.status(200).json({ images, videos, coupangLinks, message: '이미지/영상을 찾을 수 없습니다.' });
        return res.status(200).json({ images, videos, coupangLinks });
    } catch (err) {
        return res.status(200).json({ error: err.message, images: [], videos: [], coupangLinks: [] });
    }
};
