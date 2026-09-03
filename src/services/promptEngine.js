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

module.exports = { buildSajuPrompt, STYLE_TEMPLATES };
