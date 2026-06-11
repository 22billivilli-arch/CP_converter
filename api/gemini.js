// 스레드 바이럴 제품추천 대본 생성 — 제품 사진(+선택 지시)을 받아 5가지 훅 유형 포스트 생성.
// 키는 Vercel 환경변수 GEMINI_API_KEY (공개 레포에 하드코딩 금지).
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYS = `당신은 한국 스레드(Threads) 바이럴 제품 추천 포스트 전문 카피라이터입니다.
아래 제품(사진/영상/정보)을 보고 5가지 훅 유형으로 각각 완성된 포스트를 1개씩, 총 5개 작성합니다. 영상이 주어지면 영상 속 제품의 사용 장면·효과를 파악해 반영합니다.

## 구조 (모든 유형 동일)
1. 훅(1~2줄) — 유형별 방식으로 시작
2. 바디(100자 이내) — 제품 효과/경험을 감성적으로 전달
3. 클로징 — 가격 반전 또는 강한 권유로 마무리

## 5가지 유형
1. 전문가/지인 권위형: 직업 있는 지인(피부샵 직원, 물리치료사, 세탁소 삼촌 등)이 알려준 것처럼. "[직업] 친구/삼촌/언니가 알려줬는데"로 시작, 내부자 정보처럼.
2. 나만 몰랐어형: "이거 나만 몰랐어?"류 정보격차/박탈감(FOMO) 자극. "이런건 스친들 공유 좀 해줘"처럼 반말로 커뮤니티 호소.
3. 결과 먼저형: 놀라운 결과/변화를 첫 줄에 선공개. "예쁜 쓰레기인 줄 알았는데 인생템" 같은 반전 구조.
4. 정보 전달형: 제품의 핵심 정보/사용법/포인트를 깔끔하게 정리해 전달.
5. 병맛버전: 과장·드립·밈으로 웃기게, 의외성 강조.

## 톤 & 어투 (엄수)
- **무조건 반말. 존댓말 절대 금지.** 높임 어미(-요, -습니다, -세요, -네요, -아요/어요, -ㅂ니다) 전부 금지. 모든 문장은 반말로 끝낼 것.
  · "님" 호칭 금지: 스친님들(X) → 스친들(O)
  · "몰랐어요?"(X) → "몰랐어!"(O), "공유해줘요"(X) → "공유해줘"(O), "써보세요"(X) → "써봐"(O)
- 2030 MZ 신조어 섞기. 짧은 문장, 줄바꿈 자주. 최대 4줄.
- 이모지 1~3개 자연스럽게(ㄷㄷ, ㅠㅠ, 😱, ✨ 등). 의도적 오타 가끔 허용(됩써, 안알려줘써 등).

## 클로징 (상황에 맞게)
- 가격 반전형: "XX원인데 이 퀄리티가 말이 돼?"
- 가치 환산형: "XX값이라 생각하니 1도 안 아까움"
- 단종 공포형: "이거 단종되면 나 XX 못 해ㄷㄷ"
- 강한 권유형: "진짜 제발 써봐 XX 사지 말고!!!!!"`;

// kind: 'image' | 'video' — CDN 미디어를 Gemini inline_data 로 변환 (크기 초과시 null)
async function fetchMediaInline(url, kind) {
    try {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                'Referer': 'https://www.threads.net/',
            },
        });
        if (!r.ok) return null;
        let ct = (r.headers.get('content-type') || '').split(';')[0];
        const buf = Buffer.from(await r.arrayBuffer());
        // Gemini inline 요청 한도(~20MB, base64 +33%) → 영상 14MB / 사진 6MB 캡
        const cap = kind === 'video' ? 14 * 1024 * 1024 : 6 * 1024 * 1024;
        if (!buf.byteLength || buf.byteLength > cap) return null;
        if (kind === 'video') { if (!ct.startsWith('video/')) ct = 'video/mp4'; }
        else { if (!ct.startsWith('image/')) ct = 'image/jpeg'; }
        return { inline_data: { mime_type: ct, data: buf.toString('base64') } };
    } catch (_) { return null; }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { topic, imageUrl, videoUrl } = req.body || {};
    const userInfo = String(topic || '').trim();
    if (!userInfo && !imageUrl && !videoUrl)
        return res.status(400).json({ error: '제품 사진/영상 또는 주제/지시를 입력해주세요.' });

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다 (Vercel 설정 필요).' });

    // 추가지시(topic) 없으면 영상을 우선 분석, 있으면 사진 우선. 실패시 서로 폴백.
    let mediaPart = null, usedKind = '';
    const tryVideo = async () => { if (videoUrl && !mediaPart) { const v = await fetchMediaInline(videoUrl, 'video'); if (v) { mediaPart = v; usedKind = '영상'; } } };
    const tryImage = async () => { if (imageUrl && !mediaPart) { const im = await fetchMediaInline(imageUrl, 'image'); if (im) { mediaPart = im; usedKind = '사진'; } } };
    if (!userInfo) { await tryVideo(); await tryImage(); }
    else { await tryImage(); await tryVideo(); }

    const prompt = `${SYS}

## 제품 정보 / 추가 지시
${mediaPart ? `첨부된 제품 ${usedKind}을(를) 보고 작성.` : ''}${userInfo ? '\n' + userInfo : (mediaPart ? '' : '(정보 없음 — 일반 제품으로)')}

## 출력 (반드시 이 JSON만, 다른 텍스트 없이)
{"scripts":[{"type":"전문가/지인 권위형","text":"포스트 전문"},{"type":"나만 몰랐어형","text":"포스트 전문"},{"type":"결과 먼저형","text":"포스트 전문"},{"type":"정보 전달형","text":"포스트 전문"},{"type":"병맛버전","text":"포스트 전문"}]}`;

    const parts = [{ text: prompt }];
    if (mediaPart) parts.push(mediaPart);

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
                // 코드펜스/잡텍스트 제거 후 첫 { ~ 마지막 } 만 파싱 (영상 응답이 펜스 감싸는 경우 대비)
                let jt = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const a = jt.indexOf('{'), b = jt.lastIndexOf('}');
                if (a >= 0 && b > a) jt = jt.slice(a, b + 1);
                let scripts = [];
                try { scripts = normalize(JSON.parse(jt).scripts || []); } catch (_) {}
                if (scripts.length) return res.status(200).json({ scripts });
                lastErr = '대본 생성 결과가 비었습니다.';
            } catch (e) { lastErr = e.message; await sleep(800); }
        }
    }
    return res.status(200).json({ error: `대본 생성 실패: ${lastErr} (잠시 후 다시 시도)`, scripts: [] });
};

// 영상 분석은 시간이 더 걸림 → 함수 최대 실행시간 상향
module.exports.config = { maxDuration: 60 };
