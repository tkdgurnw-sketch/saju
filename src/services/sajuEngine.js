/**
 * 사주(四柱) 계산 엔진 — 간이 만세력
 *
 * 정확도에 대한 안내:
 * - 일주(日柱)는 검증된 기준일(2024-01-01 = 갑자일)을 기준으로 한 60갑자 순환 계산이라
 *   그레고리력 범위 내에서 정확합니다.
 * - 연주/월주 경계(입춘 등 절기)는 실제 태양 황경을 계산하는 대신, 매년 거의 고정적인
 *   근사 절입일(예: 입춘 2/4)을 사용합니다. 해에 따라 절기 시각이 몇 시간~하루 정도
 *   달라질 수 있어, 절기 경계 근처(예: 2월 3~5일)에 태어난 경우 실제 정통 만세력과
 *   연주/월주가 다르게 나올 수 있습니다. 전문 만세력 수준의 정밀도는 아닙니다.
 * - 대운수는 표준 정운법(다음/이전 절기까지 일수 ÷ 3)을 사용합니다.
 */

const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const STEM_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const STEM_ELEMENT = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];

const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCH_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const BRANCH_ELEMENT = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];

// 지지 → 계절 (근사: 인묘진=봄, 사오미=여름, 신유술=가을, 해자축=겨울)
const BRANCH_SEASON = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];

const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // A가 B를 생함
const CONTROLS = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' }; // A가 B를 극함

// 근사 절입일 (월, 일) — 실제 절기 시각과 최대 ±1일 오차 가능
// [절기명, 월, 일, 해당 절기부터 시작되는 월지 인덱스]
const SOLAR_TERMS = [
  { name: '소한', month: 1, day: 6, branchIndex: 1 },   // 축월 시작
  { name: '입춘', month: 2, day: 4, branchIndex: 2 },   // 인월 시작 (연주 경계이기도 함)
  { name: '경칩', month: 3, day: 6, branchIndex: 3 },
  { name: '청명', month: 4, day: 5, branchIndex: 4 },
  { name: '입하', month: 5, day: 6, branchIndex: 5 },
  { name: '망종', month: 6, day: 6, branchIndex: 6 },
  { name: '소서', month: 7, day: 7, branchIndex: 7 },
  { name: '입추', month: 8, day: 8, branchIndex: 8 },
  { name: '백로', month: 9, day: 8, branchIndex: 9 },
  { name: '한로', month: 10, day: 8, branchIndex: 10 },
  { name: '입동', month: 11, day: 7, branchIndex: 11 },
  { name: '대설', month: 12, day: 7, branchIndex: 0 },  // 자월 시작
];

// 년간(年干) → 월간(月干) 기준 매핑 (오호둔 규칙): 인월(寅月)의 월간
const MONTH_STEM_BASE_BY_YEAR_STEM = {
  0: 2, 5: 2,  // 갑,기 → 병인월부터
  1: 4, 6: 4,  // 을,경 → 무인월부터
  2: 6, 7: 6,  // 병,신 → 경인월부터
  3: 8, 8: 8,  // 정,임 → 임인월부터
  4: 0, 9: 0,  // 무,계 → 갑인월부터
};

// 일간(日干) → 시간(時干) 기준 매핑 (오자시 규칙): 자시(子時)의 시간
const HOUR_STEM_BASE_BY_DAY_STEM = {
  0: 0, 5: 0,  // 갑,기 → 갑자시부터
  1: 2, 6: 2,  // 을,경 → 병자시부터
  2: 4, 7: 4,  // 병,신 → 무자시부터
  3: 6, 8: 6,  // 정,임 → 경자시부터
  4: 8, 9: 8,  // 무,계 → 임자시부터
};

const BRANCH_CLASH_PAIRS = [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]]; // 자오/축미/인신/묘유/진술/사해 충
const BRANCH_COMBINE_PAIRS = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]; // 육합

function mod(n, m) {
  return ((n % m) + m) % m;
}

function daysBetween(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

const DAY_PILLAR_ANCHOR = new Date(Date.UTC(2024, 0, 1)); // 2024-01-01 = 갑자일 (검증됨)

function getDayPillarIndex(date) {
  const diff = daysBetween(DAY_PILLAR_ANCHOR, date);
  return mod(diff, 60); // 0 = 갑자
}

function pillarFromIndex60(index60) {
  return { stemIndex: mod(index60, 10), branchIndex: mod(index60, 12) };
}

/** 60갑자 순환에서 (stemIndex, branchIndex) 조합의 위치(0~59)를 찾는다 */
function positionOf(stemIndex, branchIndex) {
  for (let p = 0; p < 60; p++) {
    if (mod(p, 10) === stemIndex && mod(p, 12) === branchIndex) return p;
  }
  throw new Error('유효하지 않은 간지 조합입니다.');
}

function findSolarTermBoundary(date) {
  // date가 속한 절기 구간과, 다음/이전 절기까지의 날짜 차이를 계산
  const y = date.getFullYear();
  const terms = [];
  for (const t of SOLAR_TERMS) {
    terms.push({ ...t, date: new Date(Date.UTC(y - 1, t.month - 1, t.day)) });
    terms.push({ ...t, date: new Date(Date.UTC(y, t.month - 1, t.day)) });
    terms.push({ ...t, date: new Date(Date.UTC(y + 1, t.month - 1, t.day)) });
  }
  terms.sort((a, b) => a.date - b.date);

  let current = terms[0];
  let next = terms[terms.length - 1];
  for (let i = 0; i < terms.length; i++) {
    if (terms[i].date <= date) current = terms[i];
    if (terms[i].date > date) { next = terms[i]; break; }
  }
  const prevTerm = current;
  const nextTerm = next;
  return { prevTerm, nextTerm };
}

function getMonthBranchIndex(date) {
  const { prevTerm } = findSolarTermBoundary(date);
  return prevTerm.branchIndex;
}

function getYearForGanji(date) {
  // 입춘(대략 2/4) 이전이면 전년도로 간주
  const ipchun = new Date(Date.UTC(date.getFullYear(), 1, 4)); // 2월 4일
  return date >= ipchun ? date.getFullYear() : date.getFullYear() - 1;
}

function getYearPillar(date) {
  const y = getYearForGanji(date);
  const stemIndex = mod(y - 4, 10);
  const branchIndex = mod(y - 4, 12);
  return { stemIndex, branchIndex, year: y };
}

function getMonthPillar(date) {
  const yearStemIndex = getYearPillar(date).stemIndex;
  const monthBranchIndex = getMonthBranchIndex(date);
  const base = MONTH_STEM_BASE_BY_YEAR_STEM[yearStemIndex];
  const stemIndex = mod(base + mod(monthBranchIndex - 2, 12), 10);
  return { stemIndex, branchIndex: monthBranchIndex };
}

function getDayPillar(date) {
  return pillarFromIndex60(getDayPillarIndex(date));
}

function getHourPillar(date, dayStemIndex) {
  const hour = date.getUTCHours ? date.getHours() : date.getHours();
  // 2시간 단위: 23~0시=자(0), 1~2=축(1), ... 21~22=해(11)
  const branchIndex = mod(Math.floor((hour + 1) / 2), 12);
  const base = HOUR_STEM_BASE_BY_DAY_STEM[dayStemIndex];
  const stemIndex = mod(base + branchIndex, 10);
  return { stemIndex, branchIndex };
}

function pillarLabel(stemIndex, branchIndex) {
  return {
    korean: `${STEMS[stemIndex]}${BRANCHES[branchIndex]}`,
    hanja: `${STEM_HANJA[stemIndex]}${BRANCH_HANJA[branchIndex]}`,
    stemElement: STEM_ELEMENT[stemIndex],
    branchElement: BRANCH_ELEMENT[branchIndex],
  };
}

/**
 * 생년월일시로 사주 원국(4기둥)을 계산한다.
 * @param {Date} birthDate - 로컬 시간 기준 생년월일시 (Date 객체)
 * @returns {{year, month, day, hour}} 각 기둥의 {stemIndex, branchIndex, label}
 */
function getFourPillars(birthDate) {
  const year = getYearPillar(birthDate);
  const month = getMonthPillar(birthDate);
  const day = getDayPillar(birthDate);
  const hour = getHourPillar(birthDate, day.stemIndex);

  return {
    year: { ...year, label: pillarLabel(year.stemIndex, year.branchIndex) },
    month: { ...month, label: pillarLabel(month.stemIndex, month.branchIndex) },
    day: { ...day, label: pillarLabel(day.stemIndex, day.branchIndex) },
    hour: { ...hour, label: pillarLabel(hour.stemIndex, hour.branchIndex) },
  };
}

/**
 * 대운(大運) 계산: 방향(순행/역행), 대운수, 그리고 "오늘" 기준 현재 대운 기둥을 반환
 * @param {Date} birthDate
 * @param {'M'|'F'} gender
 * @param {object} fourPillars - getFourPillars() 결과
 * @param {Date} referenceDate - 대운을 조회할 기준일 (보통 오늘)
 */
function getDaewoon(birthDate, gender, fourPillars, referenceDate) {
  const yearStemIndex = fourPillars.year.stemIndex;
  const isYangYearStem = yearStemIndex % 2 === 0; // 갑병무경임 = 양간
  // 정운법: 남자+양간해 또는 여자+음간해 → 순행, 그 외 → 역행
  const forward = (gender === 'M' && isYangYearStem) || (gender === 'F' && !isYangYearStem);

  const { prevTerm, nextTerm } = findSolarTermBoundary(birthDate);
  const targetTermDate = forward ? nextTerm.date : prevTerm.date;
  const daysToTerm = Math.abs(daysBetween(birthDate, targetTermDate));

  let daewoonNumber = Math.round(daysToTerm / 3);
  if (daewoonNumber < 1) daewoonNumber = 1;

  const monthPosition = positionOf(fourPillars.month.stemIndex, fourPillars.month.branchIndex);

  // 현재 나이 계산 (만 나이)
  let ageYears = referenceDate.getFullYear() - birthDate.getFullYear();
  const birthdayPassedThisYear =
    referenceDate.getMonth() > birthDate.getMonth() ||
    (referenceDate.getMonth() === birthDate.getMonth() && referenceDate.getDate() >= birthDate.getDate());
  if (!birthdayPassedThisYear) ageYears -= 1;

  let periodIndex = 0; // 0 = 대운 시작 전(월주 그대로 적용)
  if (ageYears >= daewoonNumber) {
    periodIndex = 1 + Math.floor((ageYears - daewoonNumber) / 10);
  }

  const direction = forward ? 1 : -1;
  const position = mod(monthPosition + periodIndex * direction, 60);
  const { stemIndex, branchIndex } = pillarFromIndex60(position);

  return {
    forward,
    daewoonNumber,
    currentAge: ageYears,
    periodIndex,
    stemIndex,
    branchIndex,
    label: pillarLabel(stemIndex, branchIndex),
  };
}

/** 십성 기반 관계 판정: 세운/일운 등의 간지가 일간(day master)에게 미치는 영향 */
function judgeFortune(otherStemElement, dayMasterElement) {
  if (CONTROLS[otherStemElement] === dayMasterElement) return '흉운'; // 관살: 나를 극함
  return '길운'; // 비겁/인성/식상/재성은 상대적으로 순화하여 길운으로 취급 (간이 버전)
}

/** 오늘의 일주와 사람의 일주 관계로 일운 포인트(충/형, 합, 재성운, 인성운)를 결정 */
function judgeDailyDetail(todayDay, personDay) {
  const clash = BRANCH_CLASH_PAIRS.some(
    ([a, b]) => (a === todayDay.branchIndex && b === personDay.branchIndex) ||
                (b === todayDay.branchIndex && a === personDay.branchIndex)
  );
  if (clash) return '충/형';

  const combine = BRANCH_COMBINE_PAIRS.some(
    ([a, b]) => (a === todayDay.branchIndex && b === personDay.branchIndex) ||
                (b === todayDay.branchIndex && a === personDay.branchIndex)
  );
  if (combine) return '합';

  const todayElem = STEM_ELEMENT[todayDay.stemIndex];
  const dayMasterElem = STEM_ELEMENT[personDay.stemIndex];
  if (GENERATES[todayElem] === dayMasterElem) return '인성운'; // 오늘 기운이 나를 생함
  return '재성운'; // 그 외는 재성운으로 간이 처리
}

/**
 * 생년월일시 + 성별로 오늘 기준 전체 사주 해석을 계산한다.
 * @param {Date} birthDate
 * @param {'M'|'F'} gender
 * @param {Date} [today]
 */
function interpret(birthDate, gender, today = new Date()) {
  const fourPillars = getFourPillars(birthDate);
  const dayMasterElement = STEM_ELEMENT[fourPillars.day.stemIndex];

  const daewoon = getDaewoon(birthDate, gender, fourPillars, today);
  const yearPillarToday = getYearPillar(today);
  const monthPillarToday = getMonthPillar(today);
  const dayPillarToday = getDayPillar(today);

  const seyunElement = STEM_ELEMENT[yearPillarToday.stemIndex];
  const luckState = judgeFortune(seyunElement, dayMasterElement);
  const season = BRANCH_SEASON[monthPillarToday.branchIndex];
  const dailyDetail = judgeDailyDetail(dayPillarToday, fourPillars.day);

  return {
    fourPillars,
    coreElement: dayMasterElement,
    daewoon: {
      ...daewoon,
      description: daewoon.periodIndex === 0
        ? `아직 첫 대운(만 ${daewoon.daewoonNumber}세부터) 이전입니다.`
        : `${daewoon.forward ? '순행' : '역행'} 대운, 만 ${daewoon.daewoonNumber}세부터 10년 주기로 흐릅니다.`,
    },
    seyun: {
      ...yearPillarToday,
      label: pillarLabel(yearPillarToday.stemIndex, yearPillarToday.branchIndex),
    },
    monthlyUn: {
      ...monthPillarToday,
      label: pillarLabel(monthPillarToday.stemIndex, monthPillarToday.branchIndex),
    },
    dailyUn: {
      ...dayPillarToday,
      label: pillarLabel(dayPillarToday.stemIndex, dayPillarToday.branchIndex),
    },
    luckState,
    season,
    dailyDetail,
  };
}

module.exports = {
  getFourPillars,
  getDaewoon,
  interpret,
  STEMS,
  BRANCHES,
  STEM_ELEMENT,
  BRANCH_ELEMENT,
};
