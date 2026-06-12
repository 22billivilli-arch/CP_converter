// 클라이언트 직접 업로드용 토큰 발급 (Vercel Blob handleUpload).
// 프론트(@vercel/blob/client upload)가 이 라우트로 토큰 요청 → Blob에 직접 업로드(대용량 가능).
const { handleUpload } = require('@vercel/blob/client');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        const jsonResponse = await handleUpload({
            body: req.body,
            request: req,
            onBeforeGenerateToken: async () => ({
                allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
                addRandomSuffix: true,
                maximumSizeInBytes: 200 * 1024 * 1024,
            }),
            onUploadCompleted: async () => { /* no-op */ },
        });
        return res.status(200).json(jsonResponse);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
};
