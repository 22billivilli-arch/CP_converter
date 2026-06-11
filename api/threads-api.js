// Threads Graph API 프록시 — 토큰을 서버(Vercel env)에 숨김.
// 프론트는 access_token=TKN::<계정명> 형태로 호출 → 여기서 실토큰으로 치환해 forward.
// THREADS_TOKENS = {"계정명":"실토큰",...} (Vercel env), PROXY_SECRET = 호출 인증용.
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    let TOKENS = {};
    try { TOKENS = JSON.parse(process.env.THREADS_TOKENS || '{}'); } catch (_) {}
    const SECRET = process.env.PROXY_SECRET || '';

    const { url, method, secret } = req.body || {};
    if (SECRET && secret !== SECRET) return res.status(401).json({ error: '프록시 인증 실패 (시크릿 확인)' });
    if (!url) return res.status(400).json({ error: 'url 필요' });
    // graph.threads.net 만 허용
    if (!/^https:\/\/graph\.threads\.net\//.test(url)) return res.status(400).json({ error: '허용되지 않은 URL' });

    const finalUrl = String(url).replace(/TKN__([A-Za-z0-9_.]+)/g, (m, name) => TOKENS[name] != null ? encodeURIComponent(TOKENS[name]) : m);

    try {
        const r = await fetch(finalUrl, { method: (method || 'GET').toUpperCase() });
        const j = await r.json().catch(() => ({}));
        return res.status(r.ok ? 200 : (r.status || 502)).json(j);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
