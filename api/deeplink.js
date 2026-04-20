const crypto = require('crypto');

function generateAuthorization(method, path, accessKey, secretKey) {
    const datetime = new Date().toISOString().substring(2, 19)
        .replace(/-/g, '').replace(/:/g, '').replace('T', 't') + 'Z';
    const message = datetime + method + path;
    const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
    return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url, accessKey, secretKey, subId } = req.body;
    if (!url || !accessKey || !secretKey) {
        return res.status(400).json({ error: '필수 값이 없습니다.' });
    }

    const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
    const authHeader = generateAuthorization('POST', path, accessKey, secretKey);

    // 단축/파트너스 링크면 실제 상품 URL로 풀기
    let productUrl = url;
    try {
        const resolved = await fetch(url, { method: 'GET', redirect: 'follow' });
        const finalUrl = resolved.url;
        if (finalUrl && finalUrl.includes('coupang.com')) {
            const u = new URL(finalUrl);
            // 기존 파트너스 파라미터 제거
            u.searchParams.delete('lptag');
            u.searchParams.delete('subId');
            u.searchParams.delete('pageKey');
            productUrl = u.origin + u.pathname + (u.search ? u.search : '');
        }
    } catch (_) {}

    const body = { coupangUrls: [productUrl] };
    if (subId) body.subId = subId;

    try {
        const response = await fetch('https://api-gateway.coupang.com' + path, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
