const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { buildSajuPrompt } = require('./promptEngine');
const imageProvider = require('./imageProvider');
const { processProviderResult, persistQuadrants } = require('./imageProcessor');

const DAILY_TTL_DAYS = Number(process.env.DAILY_IMAGE_TTL_DAYS || 7);
const OUTPUT_DIR = process.env.LOCAL_OUTPUT_DIR || './storage/cropped';

/**
 * 사주 시각화 전체 파이프라인: 프롬프트 조립 → 이미지 생성 → 크롭/변환 → 저장 → DB 기록
 *
 * @param {Object} input
 * @param {string} input.userId
 * @param {'ORIENTAL'|'MINIMAL'|'3D'} input.style
 * @param {'DAILY'|'MONTHLY'|'DAEWUN'} input.sajuType
 * @param {string} input.coreElement
 * @param {string} input.luckState
 * @param {string} input.dailyDetail
 * @param {string} input.analysisSummary
 * @param {Object} input.analysisDetails
 */
async function createSajuVisualization(input) {
  const {
    userId, style, sajuType, coreElement, luckState, dailyDetail,
    analysisSummary, analysisDetails,
  } = input;

  // 1. 프롬프트 조립
  const { prompt } = buildSajuPrompt({ style, coreElement, luckState, dailyDetail });

  // 2. 이미지 생성 (정식 API)
  const providerResult = await imageProvider.generateImage(prompt);

  // 3. 크롭/webp 변환
  const quadrants = await processProviderResult(providerResult);

  // 4. 저장 (로컬 → 실서비스에서는 S3 스트림 업로드로 교체)
  const filePrefix = `${userId}_${sajuType}_${uuidv4().slice(0, 8)}`;
  const savedPaths = await persistQuadrants(quadrants, filePrefix, OUTPUT_DIR);

  // 5. 만료 정책 (DAILY만 TTL 적용)
  const expireAt = sajuType === 'DAILY'
    ? new Date(Date.now() + DAILY_TTL_DAYS * 24 * 60 * 60 * 1000)
    : null;

  // 6. DB 기록
  const { rows } = await db.query(
    `INSERT INTO saju_visualizations
      (user_id, style_type, saju_type, analysis_summary, analysis_details,
       applied_prompt, source_image_url, image_path_u1, image_path_u2,
       image_path_u3, image_path_u4, expire_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      userId, style, sajuType, analysisSummary, analysisDetails,
      prompt, providerResult.providerRef || 'n/a',
      savedPaths.U1, savedPaths.U2, savedPaths.U3, savedPaths.U4,
      expireAt,
    ]
  );

  return { row: rows[0], prompt };
}

module.exports = { createSajuVisualization };
