/**
 * 이미지 생성 프로바이더 추상 레이어.
 *
 * 미드저니 셀프봇처럼 이용약관을 위반하는 자동화 대신,
 * 정식 REST API를 제공하는 서비스(Stability AI 등)를 사용한다.
 * 다른 정식 이미지 API(Ideogram, Leonardo.ai, OpenAI Images 등)로 교체하려면
 * 이 파일의 generateImage() 구현부만 바꾸면 된다. (인터페이스는 동일하게 유지)
 */

const axios = require('axios');
require('dotenv').config();

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const STABILITY_API_HOST = process.env.STABILITY_API_HOST || 'https://api.stability.ai';
const ENGINE_ID = process.env.STABILITY_ENGINE_ID || 'stable-diffusion-xl-1024-v1-0';

/**
 * 모바일 9:16 화면비에 최대한 가까운 지원 해상도.
 * (SDXL 1.0은 고정된 몇 가지 해상도만 지원하므로 세로로 가장 긴 조합을 사용)
 */
const PORTRAIT_WIDTH = 768;
const PORTRAIT_HEIGHT = 1344;

/**
 * 프롬프트로 이미지를 생성하고 결과를 base64 Buffer로 반환한다.
 * 반환 형태를 통일해두면 imageProcessor 쪽에서 프로바이더 구분 없이 동일하게 처리 가능.
 *
 * @param {string} prompt
 * @returns {Promise<{ type: 'single', buffer: Buffer, width: number, height: number, providerRef: string }>}
 */
async function generateImage(prompt) {
  if (!STABILITY_API_KEY) {
    throw new Error('STABILITY_API_KEY가 설정되지 않았습니다 (.env 확인)');
  }

  const response = await axios.post(
    `${STABILITY_API_HOST}/v1/generation/${ENGINE_ID}/text-to-image`,
    {
      text_prompts: [{ text: prompt, weight: 1 }],
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT,
      samples: 1,
      steps: 30,
      cfg_scale: 7,
    },
    {
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 60_000,
    }
  );

  const artifact = response.data?.artifacts?.[0];
  if (!artifact?.base64) {
    throw new Error('이미지 생성 응답에 base64 데이터가 없습니다.');
  }

  return {
    type: 'single', // 'grid'였다면 imageProcessor가 4분할 크롭을 수행하지만, 이 프로바이더는 단일 이미지를 반환
    buffer: Buffer.from(artifact.base64, 'base64'),
    width: PORTRAIT_WIDTH,
    height: PORTRAIT_HEIGHT,
    providerRef: artifact.seed !== undefined ? String(artifact.seed) : null,
  };
}

module.exports = { generateImage };
