const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');

const WEBP_QUALITY = 85;

/**
 * 2x2 그리드 이미지를 U1(좌상)~U4(우하) 4장으로 크롭한다.
 * (그리드를 반환하는 프로바이더를 쓸 경우에 사용)
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ U1: Buffer, U2: Buffer, U3: Buffer, U4: Buffer }>}
 */
async function cropGridToQuadrants(imageBuffer) {
  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const halfW = Math.floor(meta.width / 2);
  const halfH = Math.floor(meta.height / 2);

  const regions = {
    U1: { left: 0, top: 0, width: halfW, height: halfH },
    U2: { left: halfW, top: 0, width: meta.width - halfW, height: halfH },
    U3: { left: 0, top: halfH, width: halfW, height: meta.height - halfH },
    U4: { left: halfW, top: halfH, width: meta.width - halfW, height: meta.height - halfH },
  };

  const entries = await Promise.all(
    Object.entries(regions).map(async ([key, rect]) => {
      const buf = await sharp(imageBuffer).extract(rect).webp({ quality: WEBP_QUALITY }).toBuffer();
      return [key, buf];
    })
  );

  return Object.fromEntries(entries);
}

/**
 * 단일 이미지를 webp로 변환한다. 그리드가 아닌 프로바이더(예: Stability AI)를 쓸 때
 * U1에만 결과를 채우고 U2~U4는 비워둔다(프론트에서 U1을 기본 추천 이미지로 사용).
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>}
 */
async function convertToWebp(imageBuffer) {
  return sharp(imageBuffer).webp({ quality: WEBP_QUALITY }).toBuffer();
}

/**
 * 프로바이더 응답 타입에 따라 분기 처리.
 * @param {{ type: 'single'|'grid', buffer: Buffer }} providerResult
 * @returns {Promise<{ U1: Buffer, U2: Buffer|null, U3: Buffer|null, U4: Buffer|null }>}
 */
async function processProviderResult(providerResult) {
  if (providerResult.type === 'grid') {
    return cropGridToQuadrants(providerResult.buffer);
  }
  const u1 = await convertToWebp(providerResult.buffer);
  return { U1: u1, U2: null, U3: null, U4: null };
}

/**
 * 로컬 디스크에 저장 (실제 서비스에서는 S3 등 클라우드 스토리지 업로드 스트림으로 교체)
 * @param {Record<string, Buffer|null>} quadrants
 * @param {string} filePrefix
 * @param {string} outputDir
 * @returns {Promise<Record<string, string|null>>} 저장된 경로(U1~U4)
 */
async function persistQuadrants(quadrants, filePrefix, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const result = {};

  for (const [key, buf] of Object.entries(quadrants)) {
    if (!buf) {
      result[key] = null;
      continue;
    }
    const filePath = path.join(outputDir, `${filePrefix}_${key}.webp`);
    await fs.writeFile(filePath, buf);
    result[key] = filePath; // 실서비스에서는 여기서 CDN URL로 치환
  }

  return result;
}

module.exports = {
  cropGridToQuadrants,
  convertToWebp,
  processProviderResult,
  persistQuadrants,
};
