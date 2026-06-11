function extractShortcode(url) {
    const m = url.match(/\/post\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

const unescape = s => s
    .replace(/\\u0026/g, '&').replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/').replace(/\\/g, '');

async function fetchHtml(url, ua) {
    const r = await fetch(url, {
        headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        },
        redirect: 'follow',
    });
    return r.text();
}

function parseMedia(html) {
    const images = [], videos = [], coupangLinks = [], seen = new Set();
    const add = (arr, u) => { if (u && u.startsWith('http') && !seen.has(u)) { seen.add(u); arr.push(u); } };

    for (const pat of [
        /<meta[^>]+property="og:image[^"]*"[^>]+content="([^"]+)"/gi,
        /<meta[^>]+content="([^"]+)"[^>]+property="og:image[^"]*"/gi,
    ]) for (const m of html.matchAll(pat)) add(images, m[1].replace(/&amp;/g, '&'));

    // JSON 하이드레이션 내 이미지 (캐러셀 모든 사진 — image_versions2.candidates 최고화질 1개씩)
    for (const m of html.matchAll(/"candidates"\s*:\s*\[\s*\{\s*"url"\s*:\s*"(https:[^"]{10,})"/g))
        add(images, unescape(m[1]));
    for (const m of html.matchAll(/"image_url"\s*:\s*"(https:[^"]{10,}\.(?:jpg|jpeg|webp|heic)[^"]*)"/gi))
        add(images, unescape(m[1]));
    // embed/HTML 내 scontent CDN 게시물 이미지 (프로필사진 t51.*-19, UI static.cdninstagram 제외)
    for (const m of html.matchAll(/https:\/\/scontent[a-z0-9.\-]*\.cdninstagram\.com\/v\/[^\s"'\\<>]+\.(?:jpg|jpeg|webp)[^\s"'\\<>]*/g)) {
        if (/\/t51\.\d+-19\//.test(m[0])) continue;
        add(images, m[0].replace(/&amp;/g, '&'));
    }

    for (const pat of [
        /<meta[^>]+property="og:video[^"]*"[^>]+content="([^"]+)"/gi,
        /<meta[^>]+content="([^"]+)"[^>]+property="og:video[^"]*"/gi,
    ]) for (const m of html.matchAll(pat)) add(videos, m[1].replace(/&amp;/g, '&'));

    // JSON 내 영상 URL 패턴
    for (const pat of [
        /"video_url"\s*:\s*"(https:[^"]{10,})"/g,
        /"browser_native_hd_url"\s*:\s*"(https:[^"]{10,})"/g,
        /"browser_native_sd_url"\s*:\s*"(https:[^"]{10,})"/g,
        /"playback_url"\s*:\s*"(https:[^"]{10,})"/gi,
        /"src"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/g,
    ]) for (const m of html.matchAll(pat)) add(videos, unescape(m[1]));

    // CDN mp4 직접 패턴
    for (const pat of [
        /https:\/\/[a-z0-9-]+\.cdninstagram\.com[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/g,
        /https:\/\/scontent[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/g,
        /https:\/\/[^\s"'<>\\]+fbcdn\.net[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/g,
    ]) for (const m of html.matchAll(pat)) add(videos, unescape(m[0]));

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

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });

    const sc = extractShortcode(url);

    // 1. 브라우저 UA로 메인 페이지 파싱 (JSON 하이드레이션 데이터 포함)
    try {
        const html = await fetchHtml(url,
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        const result = parseMedia(html);
        if (result.videos.length || result.images.length)
            return res.status(200).json(result);
    } catch (_) {}

    // 2. embed URL (게시물 영상+사진이 안정적으로 포함됨)
    if (sc) {
        try {
            const embedUrl = `https://www.threads.net/t/${sc}/embed/`;
            const html = await fetchHtml(embedUrl,
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
            const result = parseMedia(html);
            if (result.videos.length || result.images.length)
                return res.status(200).json(result);
        } catch (_) {}
    }

    // 3. LinkedInBot UA (이미지는 확실히 옴)
    try {
        const html = await fetchHtml(url,
            'LinkedInBot/1.0 (compatible; compatible; http://www.linkedin.com/help/linkedin)');
        const result = parseMedia(html);
        if (result.videos.length || result.images.length)
            return res.status(200).json(result);
        return res.status(200).json({ ...result, message: '이미지/영상을 찾을 수 없습니다.' });
    } catch (err) {
        return res.status(200).json({ error: err.message, images: [], videos: [], coupangLinks: [] });
    }
};
