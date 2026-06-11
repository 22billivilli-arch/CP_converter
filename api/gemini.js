// 스레드 대본 생성 — 주제/지시를 받아 Gemini로 여러 대본 후보 생성.
// 키는 Vercel 환경변수 GEMINI_API_KEY 로 보관(공개 레포에 하드코딩 금지).
const MODEL = 'gemini-2.5-flash';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { topic, count } = req.body || {};
    if (!topic || !String(topic).trim()) return res.status(400).json({ error: '주제/지시를 입력해주세요.' });
    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 10);

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다 (Vercel 설정 필요).' });

    const prompt = `너는 한국어 스레드(Threads) 콘텐츠 작가야. 아래 주제/지시를 바탕으로 매력적인 스레드 게시글 대본을 정확히 ${n}개 만들어줘.
- 각 대본은 서로 다른 앵글/톤(정보형, 공감형, 후킹형, 스토리형 등)으로.
- 첫 문장은 강력한 후킹, 이후 본문, 마지막에 어울리는 해시태그 2~5개.
- 한 대본당 200~400자.
- 광고/과장 표현은 자연스럽게.

주제/지시:
${String(topic).trim()}`;

    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 1.1,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'OBJECT',
                        properties: { scripts: { type: 'ARRAY', items: { type: 'STRING' } } },
                        required: ['scripts'],
                    },
                },
            }),
        });
        const data = await r.json();
        if (data.error) return res.status(500).json({ error: data.error.message || 'Gemini 오류', scripts: [] });
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        let scripts = [];
        try { scripts = (JSON.parse(text).scripts || []).filter(s => s && s.trim()); }
        catch (_) { scripts = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean).slice(0, n); }
        if (!scripts.length) return res.status(200).json({ error: '대본 생성 결과가 비었습니다.', scripts: [] });
        return res.status(200).json({ scripts });
    } catch (e) {
        return res.status(200).json({ error: e.message, scripts: [] });
    }
};
