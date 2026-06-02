function extractShortcode(url) {
    const m = url.match(/\/post\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

const unescape = s => s
    .replace(/\\u0026/g, '&').replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/').replace(/\\/g, '');

// /me/threads permalink 검색으로 실제 media ID 찾기
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

async function scrapeHtml(url) {
    const r = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        redirect: 'follow',
    });
    const html = await r.text();
    const images = [], videos = [], coupangLinks = [], seen = new Set();
    const addImg = u => { if (u && u.startsWith('http') && !seen.has(u) && !u.includes('rsrc.php') && !u.includes('s150x150')) { seen.add(u); images.push(u); } };
    const addVid = u => { if (u && u.startsWith('http') && !seen.has(u)) { seen.add(u); videos.push(u); } };

    for (const re of [
        /<meta[^>]+property="og:image[^"]*"[^>]+content="([^"]+)"/gi,
        /<meta[^>]+content="([^"]+)"[^>]+property="og:image[^"]*"/gi,
    ]) for (const m of html.matchAll(re)) addImg(m[1].replace(/&amp;/g, '&'));

    for (const re of [
        /<meta[^>]+property="og:video(?::url|:secure_url)?"[^>]+content="([^"]+)"/gi,
        /<meta[^>]+content="([^"]+)"[^>]+property="og:video(?::url|:secure_url)?"/gi,
    ]) for (const m of html.matchAll(re)) { const u = m[1].replace(/&amp;/g, '&'); if (u.includes('.mp4') || u.includes('video')) addVid(u); }

    for (const re of [
        /"video_url"\s*:\s*"(https:[^"]{10,})"/g,
        /"browser_native_hd_url"\s*:\s*"(https:[^"]{10,})"/g,
        /"browser_native_sd_url"\s*:\s*"(https:[^"]{10,})"/g,
    ]) for (const m of html.matchAll(re)) addVid(unescape(m[1]));

    for (const m of html.matchAll(/https?:\/\/(?:link\.coupang\.com|www\.coupang\.com|cpang\.me)\/\S+/g))
        if (!coupangLinks.includes(m[0])) coupangLinks.push(m[0]);

    return { images, videos, coupangLinks };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url, token } = req.body;
    if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });

    // 1. Graph API (토큰으로 permalink 검색 → 실제 ID → media_url)
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

    // 2. HTML 파싱 폴백
    try {
        const result = await scrapeHtml(url);
        if (!result.images.length && !result.videos.length)
            return res.status(200).json({ ...result, message: '이미지/영상을 찾을 수 없습니다.' });
        return res.status(200).json(result);
    } catch (err) {
        return res.status(200).json({ error: err.message, images: [], videos: [], coupangLinks: [] });
    }
};
