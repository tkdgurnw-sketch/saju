const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { buildSajuPrompt } = require('./promptEngine');
const sajuEngine = require('./sajuEngine');
const imageProvider = require('./imageProvider');
const { processProviderResult, persistQuadrants } = require('./imageProcessor');

const DAILY_TTL_DAYS = Number(process.env.DAILY_IMAGE_TTL_DAYS || 7);
const OUTPUT_DIR = process.env.LOCAL_OUTPUT_DIR || './storage/cropped';

/**
 * 사주 시각화 전체 파이프라인: (생년월일시 계산 또는 수동 입력) → 프롬프트 조립
 * → 이미지 생성 → 크롭/변환 → 저장 → DB 기록
 *
 * @param {Object} input
 * @param {string} input.userId
 * @param {'ORIENTAL'|'MINIMAL'|'3D'} input.style
 * @param {'DAILY'|'MONTHLY'|'DAEWUN'} input.sajuType
 * @param {string} [input.birthDateTime] - ISO 문자열. 있으면 만세력 자동 계산 모드
 * @param {'M'|'F'} [input.gender] - 자동 계산 모드에서 대운 방향 결정에 필요
 * @param {string} [input.coreElement]  - 수동 모드: 원국 오행
 * @param {string} [input.luckState]    - 수동 모드: 대운/월운 상태
 * @param {string} [input.dailyDetail]  - 수동 모드: 일운 디테일
 */
async function createSajuVisualization(input) {
  const {
    userId, style, sajuType,
    birthDateTime, gender,
    coreElement, luckState, dailyDetail,
    analysisSummary: manualSummary, analysisDetails: manualDetails,
  } = input;

  let promptInput;
  let analysisSummary = manualSummary;
  let analysisDetails = manualDetails || {};
  let sajuComputed = null;

  if (birthDateTime) {
    // 자동 계산 모드: 생년월일시 → 만세력 해석
    const birth = new Date(birthDateTime);
    if (Number.isNaN(birth.getTime())) {
      throw new Error('birthDateTime 형식이 올바르지 않습니다.');
    }
    sajuComputed = sajuEngine.interpret(birth, gender === 'F' ? 'F' : 'M');

    promptInput = {
      style,
      coreElement: sajuComputed.coreElement,
      luckState: sajuComputed.luckState,
      season: sajuComputed.season,
      dailyDetail: sajuComputed.dailyDetail,
    };

    analysisDetails = {
      four_pillars: {
        year: {
          korean: sajuComputed.fourPillars.year.label.korean,
          gan: { han: sajuComputed.fourPillars.year.label.hanja[0], kor: sajuComputed.fourPillars.year.label.korean[0], element: sajuComputed.fourPillars.year.label.stemElement },
          ji: { han: sajuComputed.fourPillars.year.label.hanja[1], kor: sajuComputed.fourPillars.year.label.korean[1], element: sajuComputed.fourPillars.year.label.branchElement },
        },
        month: {
          korean: sajuComputed.fourPillars.month.label.korean,
          gan: { han: sajuComputed.fourPillars.month.label.hanja[0], kor: sajuComputed.fourPillars.month.label.korean[0], element: sajuComputed.fourPillars.month.label.stemElement },
          ji: { han: sajuComputed.fourPillars.month.label.hanja[1], kor: sajuComputed.fourPillars.month.label.korean[1], element: sajuComputed.fourPillars.month.label.branchElement },
        },
        day: {
          korean: sajuComputed.fourPillars.day.label.korean,
          gan: { han: sajuComputed.fourPillars.day.label.hanja[0], kor: sajuComputed.fourPillars.day.label.korean[0], element: sajuComputed.fourPillars.day.label.stemElement },
          ji: { han: sajuComputed.fourPillars.day.label.hanja[1], kor: sajuComputed.fourPillars.day.label.korean[1], element: sajuComputed.fourPillars.day.label.branchElement },
        },
        hour: {
          korean: sajuComputed.fourPillars.hour.label.korean,
          gan: { han: sajuComputed.fourPillars.hour.label.hanja[0], kor: sajuComputed.fourPillars.hour.label.korean[0], element: sajuComputed.fourPillars.hour.label.stemElement },
          ji: { han: sajuComputed.fourPillars.hour.label.hanja[1], kor: sajuComputed.fourPillars.hour.label.korean[1], element: sajuComputed.fourPillars.hour.label.branchElement },
        },
      },
      gyeokguk: {
        name: sajuComputed.gyeokguk.name,
        basis: sajuComputed.gyeokguk.basis,
      },
      strength: {
        type: sajuComputed.strength.isStrong ? '신강' : '신약',
        supportive_score: sajuComputed.strength.supportiveScore,
        draining_score: sajuComputed.strength.drainingScore,
      },
      yongsin: {
        eokbu: sajuComputed.yongsin.eokbu,
        johu: sajuComputed.yongsin.johu,
        tonggwan: sajuComputed.yongsin.tonggwan,
        byeongyak: sajuComputed.yongsin.byeongyak,
        jeonwang: sajuComputed.yongsin.jeonwang,
      },
      interactions: sajuComputed.interactions.map((i) => ({
        type: i.type,
        current: i.current,
        target: i.target,
        currentHanja: i.currentHanja,
        targetHanja: i.targetHanja,
        detail: i.detail || null,
      })),
      predicted_events: sajuComputed.predictedEvents.map((e) => ({
        current: e.current,
        target: e.target,
        currentHanja: e.currentHanja,
        targetHanja: e.targetHanja,
        type: e.type,
        detail: e.detail,
        ten_god: e.tenGod,
        ten_god_group: e.tenGodGroup,
        element: e.element,
        description: e.description,
      })),
      daewun: {
        name: `${sajuComputed.daewoon.label.korean}(${sajuComputed.daewoon.label.hanja}) 대운`,
        type: sajuComputed.daewoon.forward ? '순행' : '역행',
        description: sajuComputed.daewoon.description,
      },
      seyun: { name: `${sajuComputed.seyun.label.korean}(${sajuComputed.seyun.label.hanja}) 세운` },
      monthly_un: { name: `${sajuComputed.monthlyUn.label.korean}(${sajuComputed.monthlyUn.label.hanja}) 월운` },
      daily_un: { name: `${sajuComputed.dailyUn.label.korean}(${sajuComputed.dailyUn.label.hanja}) 일운` },
    };

    if (!analysisSummary) {
      const interactionNote = sajuComputed.interactions.length > 0
        ? ` 오늘은 원국과 ${sajuComputed.interactions.length}건의 형충회합이 감지됩니다.`
        : ' 오늘은 원국과 특별한 형충회합이 없는 평온한 날입니다.';
      analysisSummary =
        `일간 ${sajuComputed.coreElement} 기운, ${sajuComputed.gyeokguk.name}·${sajuComputed.strength.isStrong ? '신강' : '신약'} 사주이며 ` +
        `억부용신은 ${sajuComputed.yongsin.eokbu.element}입니다. 오늘은 ${sajuComputed.season} 절기의 ` +
        `${sajuComputed.luckState === '길운' ? '순조로운' : '조심스러운'} 하루입니다.${interactionNote}`;
    }
  } else {
    // 수동 모드: 프론트에서 직접 오행/기운/일운을 지정
    if (!coreElement || !luckState || !dailyDetail) {
      throw new Error('수동 모드에는 coreElement, luckState, dailyDetail이 모두 필요합니다.');
    }
    promptInput = { style, coreElement, luckState, dailyDetail };
  }

  // 1. 프롬프트 조립
  const { prompt } = buildSajuPrompt(promptInput);

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

  return { row: rows[0], prompt, sajuComputed };
}

module.exports = { createSajuVisualization };
