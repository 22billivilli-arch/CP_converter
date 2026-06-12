// 샤오홍슈(小红书/RED) 영상·사진 추출 — xhslink 단축링크 또는 xiaohongshu.com URL.
const unesc = s => String(s).replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });

    try {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        const r = await fetch(url, {
            headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9,ko;q=0.8' },
            redirect: 'follow',
        });
        const html = await r.text();

        // 영상: masterUrl (여러 화질 중 첫번째=최고화질)
        const vAll = [...new Set([...html.matchAll(/"masterUrl":"([^"]+)"/g)].map(m => unesc(m[1])))];
        const videos = vAll.length ? [vAll[0]] : [];

        // 사진 포스트: imageList 의 urlDefault/urlPre (영상이 없을 때만)
        let images = [];
        if (!videos.length) {
            images = [...new Set([...html.matchAll(/"url(?:Default|Pre)":"(https?:[^"]+)"/g)].map(m => unesc(m[1])))]
                .filter(u => /xhscdn|sns-/.test(u));
        }
        return res.status(200).json({ videos, images, coupangLinks: [] });
    } catch (e) {
        return res.status(200).json({ error: e.message, videos: [], images: [] });
    }
};
module.exports.config = { maxDuration: 30 };
