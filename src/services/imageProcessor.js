const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const WEBP_QUALITY = 85;

// --- R2 (S3 호환) 클라이언트 설정 -------------------------------------
// R2는 S3 API와 호환되므로 AWS SDK의 S3Client를 그대로 사용한다.
// region은 R2에서 의미 없는 값이라 관례상 'auto'를 사용한다.
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT, // 예: https://<accountId>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
// 끝에 슬래시가 붙어 있으면 제거해서 URL 조립 시 중복 슬래시를 방지한다.
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

/**
 * R2(S3) 오브젝트 키에 한글 등 비-ASCII 문자가 섞이면 서명(SignatureDoesNotMatch) 오류가
 * 발생하는 것을 확인했다 (2026-09-16 디버깅으로 재현·확인됨: 영문 키는 성공, 한글 포함 키는
 * 동일 조건에서 100% 실패). 그래서 실제 저장 파일명에는 영문/숫자/일부 기호만 남기고,
 * 그 외(한글 등)는 전부 제거한다. 화면에 보이는 이름이나 DB에 저장되는 사용자 정보에는
 * 영향이 없고, 오직 R2에 올라가는 "파일명"만 안전하게 정제한다.
 * @param {string} part
 */
function sanitizeKeyPart(part) {
  const cleaned = String(part)
    .replace(/[^\x00-\x7F]/g, '') // 한글 등 비-ASCII 문자 제거
    .replace(/[^A-Za-z0-9._-]/g, '_') // 남은 특수문자/공백은 밑줄로
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'x';
}

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
 * Cloudflare R2에 업로드한다.
 * DB에는 이제 "파일명"이 아니라 완전한 공개 URL을 저장한다.
 * (기존 로컬 디스크 버전과 달리, index.js의 /images 정적 서빙에 더 이상 의존하지 않는다.)
 *
 * @param {Record<string, Buffer|null>} quadrants
 * @param {string} filePrefix
 * @param {string} outputDir 더 이상 사용하지 않지만 호출부 호환을 위해 인자만 유지 (R2 내 "폴더" 접두사로 활용)
 * @returns {Promise<Record<string, string|null>>} 저장된 공개 URL(U1~U4)
 */
async function persistQuadrants(quadrants, filePrefix, outputDir) {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error('R2_BUCKET_NAME / R2_PUBLIC_URL 환경변수가 설정되지 않았습니다.');
  }

  // outputDir을 R2 내부 "폴더" 경로처럼 사용 (예: saju-visualizations/xxx_U1.webp)
  const folder = outputDir
    ? outputDir.replace(/^\/+|\/+$/g, '').split('/').map(sanitizeKeyPart).join('/')
    : '';
  const safeFilePrefix = sanitizeKeyPart(filePrefix);
  const result = {};

  await Promise.all(
    Object.entries(quadrants).map(async ([key, buf]) => {
      if (!buf) {
        result[key] = null;
        return;
      }
      const fileName = `${safeFilePrefix}_${key}.webp`;
      const objectKey = folder ? `${folder}/${fileName}` : fileName;

      console.log(
        '[R2 DEBUG] rawFilePrefix =', JSON.stringify(filePrefix),
        '| safeFilePrefix =', JSON.stringify(safeFilePrefix),
        '| objectKey =', JSON.stringify(objectKey),
        '| isAscii =', /^[\x00-\x7F]*$/.test(objectKey)
      );

      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: buf,
          ContentType: 'image/webp',
        })
      );

      result[key] = `${R2_PUBLIC_URL}/${objectKey}`;
    })
  );

  return result;
}

module.exports = {
  cropGridToQuadrants,
  convertToWebp,
  processProviderResult,
  persistQuadrants,
};
