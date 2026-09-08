/**
 * 사주 데이터(원국/대운/월운/일운) + 스타일(STYLE)을 결합해
 * 이미지 생성 API용 프롬프트를 조립한다.
 * 스타일 키워드가 이미지 전체 톤을 지배하도록 항상 맨 앞에 배치한다.
 */

const STYLE_TEMPLATES = {
  ORIENTAL: (content) =>
    `A modern oriental ink wash painting of ${content}, subtle color washes, delicate brush strokes, beautiful paper texture, composition with negative space, minimalist aesthetic, masterfully crafted`,
  MINIMAL: (content) =>
    `A minimalist vector illustration of ${content}, flat design with soft color gradients, geometric shapes, clean lines, trendy behance art, pastel and muted color palette`,
  '3D': (content) =>
    `A modern 3D digital art of ${content}, smooth clay and glass textures, vibrant soft studio lighting, volumetric rays, isometric view, claymation style, blender render, octane rendering`,
};

const CORE_ELEMENT_SCENE = {
  '木': 'ancient forest',
  '火': 'volcanic landscape, glowing magma',
  '土': 'rolling canyons, golden plateau',
  '金': 'crystalline cave, metallic shards',
  '水': 'deep serene ocean at night',
};

const LUCK_STATE = {
  길운: 'flooded with warm golden hour sunlight',
  흉운: 'shrouded in thick heavy fog, dim dramatic lighting',
  봄: 'vibrant green sprouts',
  목운: 'vibrant green sprouts',
  여름: 'lush full-bloomed foliage',
  화운: 'lush full-bloomed foliage',
  가을: 'golden leaves gently falling',
  금운: 'golden leaves gently falling',
  겨울: 'blanketed in pure white snow',
  수운: 'blanketed in pure white snow',
};

const DAILY_DETAIL = {
  '충/형': 'a sudden sharp slash/crack split the center',
  '합': 'two swirling energies merging into a beautiful spiral',
  재성운: 'shimmering golden dust raining',
  인성운: 'ancient glowing runes floating',
};

/**
 * (수동 모드 전용, 하위 호환) 사용자가 오행/기운/일운을 직접 고르는 경우에 사용.
 * @param {Object} params
 * @param {'ORIENTAL'|'MINIMAL'|'3D'} params.style
 * @param {string} params.coreElement   - 원국 오행 (木/火/土/金/水)
 * @param {string} params.luckState     - 대운/월운 상태 키 (길운/흉운)
 * @param {string} [params.season]      - 계절 키 (봄/여름/가을/겨울), 있으면 길흉과 함께 조명 묘사에 반영
 * @param {string} params.dailyDetail   - 일운 디테일 키
 * @returns {{ prompt: string, contentDescription: string }}
 */
function buildSajuPrompt({ style, coreElement, luckState, season, dailyDetail }) {
  const styleFn = STYLE_TEMPLATES[style];
  if (!styleFn) {
    throw new Error(`지원하지 않는 스타일입니다: ${style}`);
  }

  const scene = CORE_ELEMENT_SCENE[coreElement];
  const luckLight = LUCK_STATE[luckState];
  const seasonLight = season ? LUCK_STATE[season] : null;
  const detail = DAILY_DETAIL[dailyDetail];

  if (!scene || !luckLight || !detail) {
    throw new Error('사주 콘텐츠 조립에 필요한 키를 찾을 수 없습니다.');
  }

  const light = seasonLight ? `${luckLight}, ${seasonLight}` : luckLight;
  const contentDescription = `${scene}, ${light}, ${detail}`;
  const prompt = styleFn(contentDescription);

  return { prompt, contentDescription };
}

/**
 * (자동 계산 모드 전용) 만세력 해석 결과를 그대로 이미지로 옮긴다.
 * - 배경: 원국+대운의 한난조습으로 결정된 자연환경
 * - 주인공: 일주(일간+일지)를 자연물+동물로 상징화
 * - 상황: 세운의 핵심 사건을 동물의 상태/행동으로 연출
 * - 강조: 일운이 그 사건을 재자극(촉발)하면 시각적으로 강하게 표현
 *
 * @param {Object} params
 * @param {'ORIENTAL'|'MINIMAL'|'3D'} params.style
 * @param {Object} params.climate         - sajuEngine.judgeClimate() 결과 (landscape 포함)
 * @param {Object} params.daySymbol       - sajuEngine.getDaySymbol() 결과 (subjectPhrase 포함)
 * @param {string} params.situationPhrase - sajuEngine.getSituationPhrase() 결과
 * @returns {{ prompt: string, contentDescription: string }}
 */
function buildSajuPromptFromReading({ style, climate, daySymbol, situationPhrase }) {
  const styleFn = STYLE_TEMPLATES[style];
  if (!styleFn) {
    throw new Error(`지원하지 않는 스타일입니다: ${style}`);
  }
  if (!climate || !daySymbol || !situationPhrase) {
    throw new Error('이미지 조립에 필요한 만세력 해석 데이터가 부족합니다.');
  }

  const contentDescription = `${daySymbol.subjectPhrase} in ${climate.landscape}, ${situationPhrase}`;
  const prompt = styleFn(contentDescription);

  return { prompt, contentDescription };
}

module.exports = { buildSajuPrompt, buildSajuPromptFromReading, STYLE_TEMPLATES };
