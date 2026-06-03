module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;
    if (!url) return res.status(400).send('url parameter required');

    try {
        const decoded = decodeURIComponent(url);
        const r = await fetch(decoded, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                'Referer':    'https://www.threads.net/',
                'Origin':     'https://www.threads.net',
                'Accept':     'video/mp4,video/*;q=0.9,*/*;q=0.8',
            },
        });
        if (!r.ok) {
            console.error(`proxy upstream ${r.status} for ${decoded.slice(0,80)}`);
            return res.status(502).json({ error: `upstream ${r.status}` });
        }
        const ct = r.headers.get('content-type') || 'application/octet-stream';
        const buf = await r.arrayBuffer();
        res.setHeader('Content-Type', ct);
        res.setHeader('Content-Disposition', 'attachment');
        res.send(Buffer.from(buf));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
