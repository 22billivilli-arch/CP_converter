module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url } = req.query;
    if (!url) return res.status(400).send('url parameter required');

    try {
        const r = await fetch(decodeURIComponent(url), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://www.threads.net/',
            },
        });
        if (!r.ok) return res.status(r.status).send(`upstream ${r.status}`);
        const ct = r.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', ct);
        res.setHeader('Content-Disposition', 'attachment');
        res.send(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
        res.status(500).send(err.message);
    }
};
