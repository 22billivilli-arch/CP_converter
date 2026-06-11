// 스레드 바이럴 제품추천 대본 생성 — 제품 사진(+선택 지시)을 받아 5가지 훅 유형 포스트 생성.
// 키는 Vercel 환경변수 GEMINI_API_KEY (공개 레포에 하드코딩 금지).
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYS = `당신은 한국 스레드(Threads) 바이럴 제품 추천 포스트 전문 카피라이터입니다.
아래 제품(사진/정보)을 보고 5가지 훅 유형으로 각각 완성된 포스트를 1개씩, 총 5개 작성합니다.

## 구조 (모든 유형 동일)
1. 훅(1~2줄) — 유형별 방식으로 시작
2. 바디(100자 이내) — 제품 효과/경험을 감성적으로 전달
3. 클로징 — 가격 반전 또는 강한 권유로 마무리

## 5가지 유형
1. 전문가/지인 권위형: 직업 있는 지인(피부샵 직원, 물리치료사, 세탁소 삼촌 등)이 알려준 것처럼. "[직업] 친구/삼촌/언니가 알려줬는데"로 시작, 내부자 정보처럼.
2. 나만 몰랐어형: "이거 나만 몰랐어?"류 정보격차/박탈감(FOMO) 자극. "스친님들 제발 공유해줘요"류 커뮤니티 호소 가능.
3. 결과 먼저형: 놀라운 결과/변화를 첫 줄에 선공개. "예쁜 쓰레기인 줄 알았는데 인생템" 같은 반전 구조.
4. 정보 전달형: 제품의 핵심 정보/사용법/포인트를 깔끔하게 정리해 전달.
5. 병맛버전: 과장·드립·밈으로 웃기게, 의외성 강조.

## 톤 & 어투
- 반말 구어체. 2030 MZ 신조어 섞기. 짧은 문장, 줄바꿈 자주. 최대 4줄.
- 이모지 1~3개 자연스럽게(ㄷㄷ, ㅠㅠ, 😱, ✨ 등). 의도적 오타 가끔 허용(됩써, 안알려줘써 등).

## 클로징 (상황에 맞게)
- 가격 반전형: "XX원인데 이 퀄리티가 말이 돼?"
- 가치 환산형: "XX값이라 생각하니 1도 안 아까움"
- 단종 공포형: "이거 단종되면 나 XX 못 해ㄷㄷ"
- 강한 권유형: "진짜 제발 써봐 XX 사지 말고!!!!!"`;

async function fetchImageInline(url) {
    try {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                'Referer': 'https://www.threads.net/',
            },
        });
        if (!r.ok) return null;
        const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
        if (!ct.startsWith('image/')) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength > 6 * 1024 * 1024) return null; // 6MB 초과 스킵
        return { inline_data: { mime_type: ct, data: buf.toString('base64') } };
    } catch (_) { return null; }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { topic, imageUrl } = req.body || {};
    if ((!topic || !String(topic).trim()) && !imageUrl)
        return res.status(400).json({ error: '제품 사진 또는 주제/지시를 입력해주세요.' });

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다 (Vercel 설정 필요).' });

    const userInfo = String(topic || '').trim();
    const prompt = `${SYS}

## 제품 정보 / 추가 지시
${imageUrl ? '첨부된 제품 사진을 보고 작성.' : ''}${userInfo ? '\n' + userInfo : (imageUrl ? '' : '(정보 없음 — 사진 기반으로)')}

## 출력 (반드시 이 JSON만, 다른 텍스트 없이)
{"scripts":[{"type":"전문가/지인 권위형","text":"포스트 전문"},{"type":"나만 몰랐어형","text":"포스트 전문"},{"type":"결과 먼저형","text":"포스트 전문"},{"type":"정보 전달형","text":"포스트 전문"},{"type":"병맛버전","text":"포스트 전문"}]}`;

    const parts = [{ text: prompt }];
    if (imageUrl) { const img = await fetchImageInline(imageUrl); if (img) parts.push(img); }

    const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 1.0, responseMimeType: 'application/json' },
    });

    const normalize = arr => arr.map(s => typeof s === 'string' ? { type: '', text: s } : { type: s.type || '', text: s.text || '' })
        .filter(s => s.text && s.text.trim());
    const isBusy = e => /high demand|overload|unavailable|exhausted|rate|quota|try again|503|429/i.test(JSON.stringify(e || ''));
    let lastErr = 'Gemini 오류';
    for (const model of MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
                });
                const data = await r.json();
                if (data.error) {
                    lastErr = data.error.message || lastErr;
                    if (isBusy(data.error)) { await sleep(1200); continue; }
                    break;
                }
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                let scripts = [];
                try { scripts = normalize(JSON.parse(text).scripts || []); }
                catch (_) { scripts = normalize(text.split(/\n{2,}/)); }
                if (scripts.length) return res.status(200).json({ scripts });
                lastErr = '대본 생성 결과가 비었습니다.';
            } catch (e) { lastErr = e.message; await sleep(800); }
        }
    }
    return res.status(200).json({ error: `대본 생성 실패: ${lastErr} (잠시 후 다시 시도)`, scripts: [] });
};
