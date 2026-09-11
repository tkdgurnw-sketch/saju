/**
 * Gemini API 연동 — 규칙 기반으로 계산된 사주 데이터를 바탕으로,
 * 훨씬 자연스럽고 풍부한 사주풀이 문장을 생성한다.
 *
 * 실패(키 미설정, 네트워크 오류, 응답 이상 등) 시에는 null을 반환하며,
 * 호출부(visualizationService.js)에서 규칙 기반 문장으로 자동 대체(fallback)한다.
 */

const axios = require('axios');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// 기본 모델이 일시적으로 과부하(503)일 때를 대비해 순서대로 재시도할 후보 모델 목록
const GEMINI_MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
].filter((m, idx, arr) => arr.indexOf(m) === idx); // 중복 제거

function endpointFor(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * 계산된 사주 데이터를 사람이 읽기 좋은 프롬프트로 정리한다.
 */
function buildPrompt(sajuComputed) {
  const p = sajuComputed;

  const fourPillarsText =
    `연주 ${p.fourPillars.year.label.korean}(${p.fourPillars.year.label.hanja}), ` +
    `월주 ${p.fourPillars.month.label.korean}(${p.fourPillars.month.label.hanja}), ` +
    `일주 ${p.fourPillars.day.label.korean}(${p.fourPillars.day.label.hanja}), ` +
    `시주 ${p.fourPillars.hour.label.korean}(${p.fourPillars.hour.label.hanja})`;

  const yongsinText = [
    `억부용신: ${p.yongsin.eokbu.element}`,
    p.yongsin.johu.applicable ? `조후용신: ${p.yongsin.johu.element}` : null,
    p.yongsin.tonggwan.applicable ? `통관용신: ${p.yongsin.tonggwan.element}` : null,
    p.yongsin.byeongyak.applicable ? `병약용신: ${p.yongsin.byeongyak.element} (병: ${p.yongsin.byeongyak.diseaseElement})` : null,
    p.yongsin.jeonwang.applicable && p.yongsin.jeonwang.element ? `전왕용신: ${p.yongsin.jeonwang.element}` : null,
  ].filter(Boolean).join(', ');

  const coreEventsText = p.predictedEvents.length > 0
    ? p.predictedEvents.map((e) => `- [${e.tierLabel}] ${e.description}`).join('\n')
    : '- 세운 차원에서 원국·대운을 직접 건드리는 형충회합은 없음';

  const timingEventsText = p.timingEvents.filter((e) => e.reinforces).length > 0
    ? p.timingEvents.filter((e) => e.reinforces).map((e) => `- ${e.description}`).join('\n')
    : '- 월운·일운 차원에서 세운 사건을 재자극하는 뚜렷한 신호는 없음';

  return `당신은 30년 경력의 명리학자입니다. 아래 계산된 사주 데이터를 바탕으로, 의뢰인이 읽기 좋은
자연스러운 한국어 사주풀이 문단을 작성해주세요.

[사주 원국]
${fourPillarsText}
일간 오행: ${p.coreElement}
격국: ${p.gyeokguk.name}
신강/신약: ${p.strength.isStrong ? '신강' : '신약'} (지원 ${p.strength.supportiveScore} / 소모 ${p.strength.drainingScore})
용신: ${yongsinText}

[지금 흐르는 대운]
${p.daewoon.label.korean}(${p.daewoon.label.hanja}) 대운, ${p.daewoon.description}
대운이 원국에 미치는 영향: ${p.daewoonEffect.summary}

[오늘 기준 세운·월운·일운]
세운 ${p.seyun.label.korean}(${p.seyun.label.hanja}), 월운 ${p.monthlyUn.label.korean}(${p.monthlyUn.label.hanja}), 일운 ${p.dailyUn.label.korean}(${p.dailyUn.label.hanja})

[세운의 핵심 사건 — 무엇이 일어나는가]
${coreEventsText}

[월운·일운의 촉발 — 언제 구체화되는가]
${timingEventsText}

---
위 데이터를 종합해서, 아래 조건을 지켜 사주풀이를 작성해주세요.
1. 5~8문장 정도의 하나의 자연스러운 문단으로 작성 (목록·번호·마크다운 기호 사용 금지)
2. 원국의 그릇(격국·신강신약·용신)을 먼저 짚어주고, 그 바탕 위에서 지금 대운의 방향, 그리고 오늘 세운·월운·일운에서 일어나는 구체적 사건을 자연스럽게 이어서 설명
3. 전문 용어(격국명, 오행 등)를 쓰되, 일반인이 이해할 수 있도록 풀어서 설명
4. 과도하게 위협적이거나 확정적인 말투(반드시 그렇게 된다 등)는 피하고, "~할 수 있습니다", "~한 시기입니다" 처럼 참고할 수 있는 어조로 작성
5. 한국어로만 작성`;
}

/**
 * @param {Object} sajuComputed - sajuEngine.interpret()의 반환값
 * @returns {Promise<string|null>} 성공 시 사주풀이 문단, 실패 시 null
 */
async function generateSajuNarrative(sajuComputed) {
  if (!GEMINI_API_KEY) {
    console.warn('[gemini] GEMINI_API_KEY가 설정되지 않아 규칙 기반 문장으로 대체합니다.');
    return null;
  }

  const prompt = buildPrompt(sajuComputed);

  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      const response = await axios.post(
        `${endpointFor(model)}?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 800 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        return text.trim();
      }
      console.warn(`[gemini] ${model} 응답에 텍스트가 없어 다음 후보로 재시도합니다.`);
    } catch (err) {
      const status = err.response?.status;
      const isOverloaded = status === 503 || err.response?.data?.error?.status === 'UNAVAILABLE';
      console.warn(
        `[gemini] ${model} 호출 실패(${status || err.message})${isOverloaded ? ' — 과부하, 다음 후보 모델로 재시도합니다.' : ''}`
      );
      // 과부하(503)나 일시적 오류가 아니면(예: 인증 오류) 더 재시도해도 의미가 없어 바로 중단
      if (!isOverloaded && status !== 429 && status !== 500) {
        console.error('[gemini] 재시도 불가능한 오류, 규칙 기반 문장으로 대체합니다:', err.response?.data || err.message);
        return null;
      }
    }
  }

  console.error('[gemini] 모든 후보 모델이 실패해 규칙 기반 문장으로 대체합니다.');
  return null;
}

module.exports = { generateSajuNarrative };
