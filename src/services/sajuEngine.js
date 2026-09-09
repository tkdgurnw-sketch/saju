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

// 오행별 한난(온도)·조습(습도) 성향 점수 (조후 판단용)
// 오행별 방위·색상·길한 숫자·취미·사물 (하도낙서 오행 배속 + 현대적 취미/사물로 확장)
const ELEMENT_ATTRS = {
  木: { direction: '동(東)', color: '청색(靑)', numbers: '3, 8', hobby: '원예·식물 가꾸기, 독서, 등산, 목공예', item: '화분이나 나무 소재의 소품, 책' },
  火: { direction: '남(南)', color: '적색(赤)', numbers: '2, 7', hobby: '요리, 노래·악기 연주, 캠프파이어, 일광욕', item: '양초나 은은한 조명, 붉은 계열 소품' },
  土: { direction: '중앙(中央)', color: '황색(黃)', numbers: '5, 10', hobby: '도자기·도예, 정원 가꾸기, 명상, 흙과 관련된 활동', item: '도자기 그릇, 황토색 소품, 화분' },
  金: { direction: '서(西)', color: '백색(白)', numbers: '4, 9', hobby: '헬스·근력 운동, 악기 연주, 재테크, 정리정돈', item: '금속 액세서리(반지·시계), 흰색 소품' },
  水: { direction: '북(北)', color: '흑색(黑)', numbers: '1, 6', hobby: '수영, 여행, 글쓰기, 명상·요가', item: '어항이나 작은 수조, 거울, 검은색 소품' },
};

function getElementAttrs(element) {
  return ELEMENT_ATTRS[element] || null;
}

const ELEMENT_HEAT = { 木: 0, 火: 2, 土: 0, 金: -1, 水: -2 };
const ELEMENT_WET = { 木: 1, 火: -1, 土: 0, 金: -1, 水: 2 };

// 일간(천간) → 자연물 상징 (이미지 프롬프트용, 영어)
const STEM_NATURE = [
  { noun: 'a towering ancient pine tree', prep: 'beneath' },       // 갑
  { noun: 'delicate ivy and wildflowers', prep: 'entwined with' }, // 을
  { noun: 'a blazing sun', prep: 'bathed in the light of' },       // 병
  { noun: 'a flickering candlelight', prep: 'illuminated by' },    // 정
  { noun: 'a vast mountain ridge', prep: 'standing upon' },        // 무
  { noun: 'fertile farmland soil', prep: 'standing upon' },        // 기
  { noun: 'a raw iron blade', prep: 'beside' },                    // 경
  { noun: 'a frost-covered gem', prep: 'beside' },                 // 신
  { noun: 'a vast ocean', prep: 'beside' },                        // 임
  { noun: 'morning dew on grass', prep: 'surrounded by' },         // 계
];

// 일지(지지) → 동물 상징 (십이지, 이미지 프롬프트용, 영어)
const BRANCH_ANIMAL = [
  'a rat', 'an ox', 'a tiger', 'a rabbit', 'a dragon', 'a snake',
  'a horse', 'a goat', 'a monkey', 'a rooster', 'a dog', 'a wild boar',
];

// 한난조습 조합별 배경 자연환경 (영어, 이미지 프롬프트용)
const LANDSCAPE_BY_CLIMATE = {
  hot_wet: 'a steaming tropical jungle with mist rising from warm wetlands',
  hot_dry: 'a scorching desert with cracked earth and shimmering heat haze',
  hot_neutral: 'a sun-drenched savanna under a blazing sky',
  cold_wet: 'a frozen misty marsh with icy fog drifting over dark water',
  cold_dry: 'a windswept snowy tundra beneath a pale frozen sky',
  cold_neutral: 'a quiet snow-covered pine forest',
  mild_wet: 'a lush green valley with gentle streams and soft mist',
  mild_dry: 'a golden rolling hillside under clear skies',
  mild_neutral: 'a serene grassy plateau under a calm sky',
};

/**
 * 원국(4기둥)+대운의 오행 구성으로 한난조습(온도·습도)을 판단하고,
 * 그에 어울리는 배경 자연환경을 결정한다.
 */
function judgeClimate(fourPillars, daewoonPillar) {
  const elements = [
    STEM_ELEMENT[fourPillars.year.stemIndex], BRANCH_ELEMENT[fourPillars.year.branchIndex],
    STEM_ELEMENT[fourPillars.month.stemIndex], BRANCH_ELEMENT[fourPillars.month.branchIndex],
    STEM_ELEMENT[fourPillars.day.stemIndex], BRANCH_ELEMENT[fourPillars.day.branchIndex],
    STEM_ELEMENT[fourPillars.hour.stemIndex], BRANCH_ELEMENT[fourPillars.hour.branchIndex],
    STEM_ELEMENT[daewoonPillar.stemIndex], BRANCH_ELEMENT[daewoonPillar.branchIndex],
  ];

  let heat = 0;
  let wet = 0;
  elements.forEach((e) => { heat += ELEMENT_HEAT[e]; wet += ELEMENT_WET[e]; });

  const heatKey = heat >= 3 ? 'hot' : heat <= -3 ? 'cold' : 'mild';
  const wetKey = wet >= 3 ? 'wet' : wet <= -3 ? 'dry' : 'neutral';
  const heatLabel = { hot: '뜨거운', cold: '차가운', mild: '온화한' }[heatKey];
  const wetLabel = { wet: '습한', dry: '건조한', neutral: '적당히 습한' }[wetKey];

  return {
    heat, wet, heatLabel, wetLabel,
    landscape: LANDSCAPE_BY_CLIMATE[`${heatKey}_${wetKey}`],
  };
}

/**
 * 일주(일간+일지)를 자연물+동물 상징으로 표현한다.
 */
function getDaySymbol(fourPillars) {
  const stem = STEM_NATURE[fourPillars.day.stemIndex];
  const animal = BRANCH_ANIMAL[fourPillars.day.branchIndex];
  return {
    animal,
    stemNoun: stem.noun,
    stemPrep: stem.prep,
    subjectPhrase: `${animal} ${stem.prep} ${stem.noun}`,
  };
}

// 형충회합 유형별로 일주 동물이 처한 "상황" 묘사 (영어, 이미지 프롬프트용)
const SITUATION_BY_TYPE = {
  삼합: (animal) => `${animal} joining together with other creatures in unison, moving as one powerful force`,
  충: (animal) => `${animal} rearing up in alarm as opposing forces collide violently around it`,
  천간충: (animal) => `${animal} rearing up in alarm as opposing forces collide violently around it`,
  합: (animal) => `${animal} peacefully nuzzling close to another gentle presence`,
  천간합: (animal) => `${animal} peacefully nuzzling close to another gentle presence`,
  형: (animal) => `${animal} tangled and struggling against twisting thorned vines`,
  파: (animal) => `${animal} startled as the ground fractures and crumbles beneath it`,
  해: (animal) => `${animal} glancing warily over its shoulder at an unseen shadow`,
};

/**
 * 세운의 핵심 사건(가장 등급이 높은 것)을 일주 동물의 상황으로 연출하고,
 * 일운의 촉발(재자극)이 있으면 시각적으로 강조하는 문구를 추가한다.
 */
function getSituationPhrase(coreEvents, timingEvents, animal) {
  let situation;
  if (!coreEvents || coreEvents.length === 0) {
    situation = `${animal} resting calmly in a tranquil stance`;
  } else {
    const top = coreEvents[0]; // tier 오름차순으로 이미 정렬되어 있음 (1이 가장 중요)
    const builder = SITUATION_BY_TYPE[top.type];
    situation = builder ? builder(animal) : `${animal} standing alert amid shifting energies`;
  }

  const dailyTrigger = (timingEvents || []).some((e) => e.current === '일운' && e.reinforces);
  const intensity = dailyTrigger
    ? ', dramatically emphasized with vivid intensity, sharp contrast, dynamic motion'
    : '';

  return situation + intensity;
}



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
const BRANCH_HARM_PAIRS = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]]; // 육해 (자미/축오/인사/묘진/신해/유술)
const BRANCH_BREAK_PAIRS = [[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [7, 10]]; // 육파 (자유/축진/인해/묘오/사신/미술)
const BRANCH_TRIPLE_PUNISH_GROUPS = [[2, 5, 8], [1, 10, 7]]; // 인사신 삼형 / 축술미 삼형
const BRANCH_MUTUAL_PUNISH_PAIRS = [[0, 3]]; // 자묘형 (상형)
const BRANCH_SELF_PUNISH = [4, 6, 9, 11]; // 진오유해 자형 (같은 지지가 겹칠 때)

// 삼합(三合) 4국 — 신자진(水)/사유축(金)/인오술(火)/해묘미(木)
const SAMHAP_GROUPS = [
  { branches: [8, 0, 4], element: '水', name: '신자진(申子辰) 삼합' },
  { branches: [5, 9, 1], element: '金', name: '사유축(巳酉丑) 삼합' },
  { branches: [2, 6, 10], element: '火', name: '인오술(寅午戌) 삼합' },
  { branches: [11, 3, 7], element: '木', name: '해묘미(亥卯未) 삼합' },
];

// 지지 본기(本氣) — 십성 판정 시 지지를 대표하는 천간
const BRANCH_MAIN_STEM = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8];

// 지장간(地藏干) — 각 지지 속에 숨어있는 천간들 (여기/중기/정기 순, 자시 순서)
const BRANCH_HIDDEN_STEMS = [
  [8, 9],       // 자: 임,계
  [9, 7, 5],    // 축: 계,신,기
  [4, 2, 0],    // 인: 무,병,갑
  [0, 1],       // 묘: 갑,을
  [1, 9, 4],    // 진: 을,계,무
  [4, 6, 2],    // 사: 무,경,병
  [2, 5, 3],    // 오: 병,기,정
  [3, 1, 5],    // 미: 정,을,기
  [4, 8, 6],    // 신: 무,임,경
  [6, 7],       // 유: 경,신
  [7, 3, 4],    // 술: 신,정,무
  [4, 0, 8],    // 해: 무,갑,임
];

// 천간합(天干合) 5쌍과 그 결합 결과 오행
const STEM_COMBINE_PAIRS = [
  { pair: [0, 5], result: '土' }, // 갑기합토
  { pair: [1, 6], result: '金' }, // 을경합금
  { pair: [2, 7], result: '水' }, // 병신합수
  { pair: [3, 8], result: '木' }, // 정임합목
  { pair: [4, 9], result: '火' }, // 무계합화
];

// 천간충(天干沖) 4쌍 — 무기(戊己)는 중앙에 있어 충하지 않음
const STEM_CLASH_PAIRS = [[0, 6], [1, 7], [2, 8], [3, 9]]; // 갑경/을신/병임/정계 충

// 암합으로 결합된 오행의 성격
const AMHAP_ELEMENT_THEME = {
  木: '새로운 시작이나 확장의 기운',
  火: '드러나지 않게 타오르는 열정이나 다툼의 소지',
  土: '신뢰나 안정적 관계가 은밀히 형성되는 기운',
  金: '결단이나 정리의 기운',
  水: '지혜나 소통이 은밀히 오가는 기운',
};

const TEN_GOD_NAMES = {
  same_same: '비견', same_diff: '겁재',
  generate_same: '식신', generate_diff: '상관',
  control_same: '편재', control_diff: '정재',
  controlled_same: '편관', controlled_diff: '정관',
  generated_same: '편인', generated_diff: '정인',
};

const SUPPORTIVE_TEN_GODS = ['비견', '겁재', '편인', '정인'];

// 인성/관성의 근원 오행 (어떤 오행이 dayElement를 생/극하는가)
const INSEONG_SOURCE = { 火: '木', 土: '火', 金: '土', 水: '金', 木: '水' }; // X가 dayElement를 생함
const GWANSEONG_SOURCE = { 土: '木', 金: '火', 水: '土', 木: '金', 火: '水' }; // X가 dayElement를 극함

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
 * 십성(十星) 판정: otherStemIndex가 dayMasterStemIndex에 대해 어떤 십성인지 반환
 */
function tenGod(dayMasterStemIndex, otherStemIndex) {
  const dayElem = STEM_ELEMENT[dayMasterStemIndex];
  const otherElem = STEM_ELEMENT[otherStemIndex];
  const sameYinYang = (dayMasterStemIndex % 2) === (otherStemIndex % 2);
  const suffix = sameYinYang ? 'same' : 'diff';

  let relation;
  if (otherElem === dayElem) relation = 'same';
  else if (GENERATES[dayElem] === otherElem) relation = 'generate';       // 일간이 생함 → 식상
  else if (CONTROLS[dayElem] === otherElem) relation = 'control';         // 일간이 극함 → 재성
  else if (CONTROLS[otherElem] === dayElem) relation = 'controlled';      // 일간을 극함 → 관성
  else if (GENERATES[otherElem] === dayElem) relation = 'generated';      // 일간을 생함 → 인성
  else relation = 'same';

  return TEN_GOD_NAMES[`${relation}_${suffix}`];
}

/** 지지의 십성 (본기 기준) */
function tenGodOfBranch(dayMasterStemIndex, branchIndex) {
  return tenGod(dayMasterStemIndex, BRANCH_MAIN_STEM[branchIndex]);
}

/**
 * 격국(格局) 판정 — 월지 본기의 십성을 기준으로 하는 표준 자평 방식(간이 버전).
 * 여러 명리학파에 따라 판단 기준이 달라질 수 있어 참고용입니다.
 */
function judgeGyeokguk(fourPillars) {
  const monthTenGod = tenGodOfBranch(fourPillars.day.stemIndex, fourPillars.month.branchIndex);
  const specialNames = { 비견: '건록격', 겁재: '양인격' };
  const name = specialNames[monthTenGod] || `${monthTenGod}격`;
  return { name, basis: monthTenGod };
}

/**
 * 신강/신약 판단 — 월지(득령) 가중치를 높게 두고, 원국 6글자(연간/연지/월간/일지/시간/시지)에
 * 더해 대운(대운간·대운지)까지 포함해 십성이 비겁·인성(신강 방향)인지
 * 식상·재성·관성(신약 방향)인지를 집계하는 간이 버전.
 * (전통적으로는 원국만으로 판단하는 경우가 많으나, 현재 10년간 지속되는 대운의 영향력도
 * 신강/신약에 함께 반영하는 방식입니다)
 */
function judgeStrength(fourPillars, daewoonPillar) {
  const dayStemIndex = fourPillars.day.stemIndex;
  const positions = [
    { god: tenGod(dayStemIndex, fourPillars.year.stemIndex), weight: 1 },
    { god: tenGodOfBranch(dayStemIndex, fourPillars.year.branchIndex), weight: 1 },
    { god: tenGod(dayStemIndex, fourPillars.month.stemIndex), weight: 1 },
    { god: tenGodOfBranch(dayStemIndex, fourPillars.month.branchIndex), weight: 2 }, // 월지는 가중치 2배 (득령)
    { god: tenGodOfBranch(dayStemIndex, fourPillars.day.branchIndex), weight: 1 },
    { god: tenGod(dayStemIndex, fourPillars.hour.stemIndex), weight: 1 },
    { god: tenGodOfBranch(dayStemIndex, fourPillars.hour.branchIndex), weight: 1 },
  ];

  if (daewoonPillar) {
    positions.push({ god: tenGod(dayStemIndex, daewoonPillar.stemIndex), weight: 1 });
    positions.push({ god: tenGodOfBranch(dayStemIndex, daewoonPillar.branchIndex), weight: 1 });
  }

  let supportive = 0;
  let draining = 0;
  for (const p of positions) {
    if (SUPPORTIVE_TEN_GODS.includes(p.god)) supportive += p.weight;
    else draining += p.weight;
  }

  return {
    isStrong: supportive >= draining,
    supportiveScore: supportive,
    drainingScore: draining,
  };
}

/**
 * ① 억부용신(抑扶用神) — 신강이면 관성으로 다스리고, 신약이면 인성으로 보태는 방식.
 * 가장 널리 쓰이는 기본 용신 판단법입니다.
 */
function judgeEokbuYongsin(dayMasterElement, isStrong) {
  if (isStrong) {
    const element = GWANSEONG_SOURCE[dayMasterElement] || GENERATES[dayMasterElement];
    return { element, applicable: true, reason: '신강(身强)하여 관성으로 기운을 다스리는 것을 우선으로 봅니다.' };
  }
  const element = INSEONG_SOURCE[dayMasterElement] || dayMasterElement;
  return { element, applicable: true, reason: '신약(身弱)하여 인성으로 기운을 보태는 것을 우선으로 봅니다.' };
}

// 조후용신 간이표: 계절별로 필요한 한난조습 보정 오행
// (실제 정통 조후용신표는 일간×월지 120가지 조합별 세부 표이나, 여기서는 계절 단위로 단순화했습니다)
const JOHU_BY_SEASON = {
  겨울: { element: '火', reason: '겨울철 한기가 심해 온기(火)로 조후를 맞추는 것이 시급합니다.' },
  여름: { element: '水', reason: '여름철 조열이 심해 냉기(水)로 조후를 맞추는 것이 시급합니다.' },
  봄: { element: '水', reason: '봄철은 만물이 자라는 시기라 수분(水)의 자양이 필요합니다.' },
  가을: { element: '火', reason: '가을철은 서늘하고 건조해지므로 온기(火)로 균형을 보완합니다.' },
};

/**
 * ② 조후용신(調候用神) — 태어난 계절의 한난조습을 조절하는 용신. (간이 버전: 계절 단위 근사)
 */
function judgeJohuYongsin(season) {
  const rule = JOHU_BY_SEASON[season] || JOHU_BY_SEASON['봄'];
  return { element: rule.element, applicable: true, reason: rule.reason };
}

/**
 * ③ 통관용신(通關用神) — 신강/신약 세력이 팽팽하게 맞서 있을 때, 그 사이를 소통시키는 용신.
 * 지원 세력과 소모 세력의 점수차가 크지 않을 때만 성립합니다.
 */
function judgeTonggwanYongsin(dayMasterElement, strength) {
  const diff = Math.abs(strength.supportiveScore - strength.drainingScore);
  if (diff > 1) {
    return { element: null, applicable: false, reason: '신강/신약 세력 차이가 뚜렷해 통관용신이 특별히 필요하지 않습니다.' };
  }
  const element = GENERATES[dayMasterElement]; // 식상: 일간과 그를 극하는 세력 사이를 소통시키는 역할
  return { element, applicable: true, reason: '지원 세력과 소모 세력이 팽팽히 맞서 있어, 식상 오행으로 기운을 소통시키는 것이 필요합니다.' };
}

/**
 * ④ 병약용신(病藥用神) — 원국에서 가장 두드러지게 균형을 해치는 오행("병")을
 * 억제하는 오행("약")을 용신으로 삼는 방식.
 */
function judgeByeongyakYongsin(fourPillars, dayMasterElement) {
  const dayStemIndex = fourPillars.day.stemIndex;
  const positions = [
    { elem: STEM_ELEMENT[fourPillars.year.stemIndex], god: tenGod(dayStemIndex, fourPillars.year.stemIndex) },
    { elem: BRANCH_ELEMENT[fourPillars.year.branchIndex], god: tenGodOfBranch(dayStemIndex, fourPillars.year.branchIndex) },
    { elem: STEM_ELEMENT[fourPillars.month.stemIndex], god: tenGod(dayStemIndex, fourPillars.month.stemIndex) },
    { elem: BRANCH_ELEMENT[fourPillars.month.branchIndex], god: tenGodOfBranch(dayStemIndex, fourPillars.month.branchIndex) },
    { elem: BRANCH_ELEMENT[fourPillars.day.branchIndex], god: tenGodOfBranch(dayStemIndex, fourPillars.day.branchIndex) },
    { elem: STEM_ELEMENT[fourPillars.hour.stemIndex], god: tenGod(dayStemIndex, fourPillars.hour.stemIndex) },
    { elem: BRANCH_ELEMENT[fourPillars.hour.branchIndex], god: tenGodOfBranch(dayStemIndex, fourPillars.hour.branchIndex) },
  ];

  const drainCount = {};
  for (const p of positions) {
    if (!SUPPORTIVE_TEN_GODS.includes(p.god)) {
      drainCount[p.elem] = (drainCount[p.elem] || 0) + 1;
    }
  }

  const entries = Object.entries(drainCount);
  if (entries.length === 0) {
    return { element: null, diseaseElement: null, applicable: false, reason: '원국을 해치는 뚜렷한 병처(病處)가 발견되지 않았습니다.' };
  }
  entries.sort((a, b) => b[1] - a[1]);
  const [diseaseElement, count] = entries[0];

  if (count < 2) {
    return { element: null, diseaseElement: null, applicable: false, reason: '특정 오행이 두드러지게 병이 될 만큼 과다하지 않습니다.' };
  }

  const medicine = Object.keys(CONTROLS).find((k) => CONTROLS[k] === diseaseElement);
  return {
    element: medicine || null,
    diseaseElement,
    applicable: !!medicine,
    reason: `${diseaseElement} 기운이 원국에서 ${count}회로 과다해 병(病)이 되므로, 이를 극하는 ${medicine || '해당'} 오행을 약(藥)으로 봅니다.`,
  };
}

/**
 * ⑤ 전왕용신(專旺用神) — 세력이 한쪽으로 극도로 치우친 경우(종격) 그 기세를 거스르지 않고
 * 따르는 용신. 지원/소모 점수 차이가 매우 클 때만 성립합니다.
 */
function judgeJeonwangYongsin(dayMasterElement, strength) {
  const total = strength.supportiveScore + strength.drainingScore;
  const dominance = Math.max(strength.supportiveScore, strength.drainingScore) / total;

  if (dominance < 0.8) {
    return { element: null, applicable: false, reason: '한쪽으로 극도로 치우친 종격(從格)에 해당하지 않아 전왕용신은 적용하지 않습니다.' };
  }

  if (strength.supportiveScore > strength.drainingScore) {
    return {
      element: dayMasterElement,
      applicable: true,
      reason: '비겁·인성이 압도적으로 강해(종왕/종강격 성향) 일간의 오행을 그대로 따르는 것을 용신으로 봅니다.',
    };
  }
  return {
    element: null,
    applicable: true,
    reason: '식상·재성·관성 등 소모 세력이 압도적으로 강해(종격 성향) 그 세력을 거스르지 않는 것이 유리하나, 정확한 종격 판별에는 원국 전체 정밀 분석이 필요합니다.',
  };
}

/**
 * 5가지 용신 이론을 종합해서 반환한다.
 * 명리학파에 따라 어떤 용신을 우선할지 견해가 다를 수 있어, 5가지 모두 참고용으로 함께 제공합니다.
 */
function judgeYongsinFull(fourPillars, dayMasterElement, season, strength) {
  return {
    eokbu: judgeEokbuYongsin(dayMasterElement, strength.isStrong),
    johu: judgeJohuYongsin(season),
    tonggwan: judgeTonggwanYongsin(dayMasterElement, strength),
    byeongyak: judgeByeongyakYongsin(fourPillars, dayMasterElement),
    jeonwang: judgeJeonwangYongsin(dayMasterElement, strength),
  };
}

/**
 * 원국(4기둥)과 오늘의 세운/월운/일운 지지 사이의 형충회합(刑沖會合)을 탐지한다.
 * @returns {Array<{type: '충'|'합'|'형'|'해', current: string, target: string}>}
 */
function findInteractions(fourPillars, daewoonPillar, currentPillars) {
  const targets = [
    { label: '연지', branchIndex: fourPillars.year.branchIndex, hanja: BRANCH_HANJA[fourPillars.year.branchIndex] },
    { label: '월지', branchIndex: fourPillars.month.branchIndex, hanja: BRANCH_HANJA[fourPillars.month.branchIndex] },
    { label: '일지', branchIndex: fourPillars.day.branchIndex, hanja: BRANCH_HANJA[fourPillars.day.branchIndex] },
    { label: '시지', branchIndex: fourPillars.hour.branchIndex, hanja: BRANCH_HANJA[fourPillars.hour.branchIndex] },
    { label: '대운', branchIndex: daewoonPillar.branchIndex, hanja: BRANCH_HANJA[daewoonPillar.branchIndex] },
  ];
  const currents = [
    {
      label: '세운', branchIndex: currentPillars.seyun.branchIndex,
      hanja: pillarLabel(currentPillars.seyun.stemIndex, currentPillars.seyun.branchIndex).hanja,
    },
    {
      label: '월운', branchIndex: currentPillars.monthlyUn.branchIndex,
      hanja: pillarLabel(currentPillars.monthlyUn.stemIndex, currentPillars.monthlyUn.branchIndex).hanja,
    },
    {
      label: '일운', branchIndex: currentPillars.dailyUn.branchIndex,
      hanja: pillarLabel(currentPillars.dailyUn.stemIndex, currentPillars.dailyUn.branchIndex).hanja,
    },
  ];

  const pairMatch = (pairs, a, b) => pairs.some(([x, y]) => (x === a && y === b) || (y === a && x === b));

  const results = [];
  for (const cur of currents) {
    for (const tgt of targets) {
      const base = {
        current: cur.label, target: tgt.label,
        currentHanja: cur.hanja, targetHanja: tgt.hanja,
        currentBranchIndex: cur.branchIndex, targetBranchIndex: tgt.branchIndex,
      };
      if (cur.branchIndex === tgt.branchIndex && BRANCH_SELF_PUNISH.includes(cur.branchIndex)) {
        results.push({ ...base, type: '형', detail: '자형' });
        continue;
      }
      if (pairMatch(BRANCH_CLASH_PAIRS, cur.branchIndex, tgt.branchIndex)) {
        results.push({ ...base, type: '충' });
      }
      if (pairMatch(BRANCH_COMBINE_PAIRS, cur.branchIndex, tgt.branchIndex)) {
        results.push({ ...base, type: '합' });
      }
      if (pairMatch(BRANCH_HARM_PAIRS, cur.branchIndex, tgt.branchIndex)) {
        results.push({ ...base, type: '해' });
      }
      if (pairMatch(BRANCH_BREAK_PAIRS, cur.branchIndex, tgt.branchIndex)) {
        results.push({ ...base, type: '파' });
      }
      if (pairMatch(BRANCH_MUTUAL_PUNISH_PAIRS, cur.branchIndex, tgt.branchIndex)) {
        results.push({ ...base, type: '형', detail: '상형' });
      }
      for (const group of BRANCH_TRIPLE_PUNISH_GROUPS) {
        if (group.includes(cur.branchIndex) && group.includes(tgt.branchIndex) && cur.branchIndex !== tgt.branchIndex) {
          results.push({ ...base, type: '형', detail: '삼형' });
        }
      }
    }
  }
  return results;
}

// 십성 → 그룹(비겁/식상/재성/관성/인성) 매핑
const TEN_GOD_GROUP = {
  비견: '비겁', 겁재: '비겁',
  식신: '식상', 상관: '식상',
  정재: '재성', 편재: '재성',
  정관: '관성', 편관: '관성',
  정인: '인성', 편인: '인성',
};

// 자리(연/월/일/시지)가 뜻하는 인생 영역
const POSITION_DOMAIN = {
  연지: '가족·윗사람·조상운과 관련된 영역',
  월지: '사회활동·부모형제·직장동료와 관련된 영역',
  일지: '본인 자신과 배우자·가까운 인간관계 영역',
  시지: '자녀·아랫사람·미래 계획과 관련된 영역',
  대운: '지금 흐르고 있는 10년 대운의 방향성과 관련된 영역',
  세운: '올해 전반의 흐름과 관련된 영역',
  월운: '이번 달의 흐름과 관련된 영역',
  일운: '오늘 하루의 흐름과 관련된 영역',
};

// 십성 그룹별 사건 테마
const TEN_GOD_GROUP_THEME = {
  비겁: '경쟁자·동료·형제자매와의 협력 또는 갈등',
  식상: '활동력·언변·표현력이 커지는 동시에 구설수나 자녀 관련 문제',
  재성: '재물의 흐름이나 이성 관계의 변화',
  관성: '직장·명예·책임·규율과 관련된 변동',
  인성: '문서·계약·학업이나 윗사람의 도움과 관련된 일',
};

// 상호작용 유형별 작용 방식
const INTERACTION_ACTION = {
  충: '강하게 흔들리며(沖) 급격한 변화나 이동수로',
  형: '날카롭게 부딪히며(刑) 다툼이나 관재구설의 형태로',
  합: '뜻밖에 결합되며(合) 새로운 인연이나 협력의 형태로',
  해: '은근하게 훼방을 받으며(害) 눈에 띄지 않는 차질의 형태로',
};

function pickParticle(word, withBatchim, withoutBatchim) {
  const lastChar = word[word.length - 1];
  const code = lastChar.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return withBatchim;
  return (code % 28) !== 0 ? withBatchim : withoutBatchim;
}

/**
 * 지장간 암합(暗合) 탐지 — 일지 속의 지장간과 다른 자리(연/월/시지, 대운, 세운/월운/일운)
 * 속의 지장간이 천간합 관계를 이룰 때, 겉으로 드러나지 않는 결합 작용을 찾아낸다.
 */
/**
 * 천간(天干)의 합·충 탐지 — 세운/월운/일운의 천간이 원국의 연간·월간·일간·시간, 대운간과
 * 합(合)하거나 충(沖)하는지 확인한다. 특히 일간과의 작용은 본인 자체에 영향을 주는
 * 핵심 신호로 취급한다.
 */
function findStemInteractions(fourPillars, daewoonPillar, currentPillars) {
  const targets = [
    { label: '연간', stemIndex: fourPillars.year.stemIndex },
    { label: '월간', stemIndex: fourPillars.month.stemIndex },
    { label: '일간', stemIndex: fourPillars.day.stemIndex },
    { label: '시간', stemIndex: fourPillars.hour.stemIndex },
    { label: '대운간', stemIndex: daewoonPillar.stemIndex },
  ];
  const currents = [
    { label: '세운', stemIndex: currentPillars.seyun.stemIndex, branchIndex: currentPillars.seyun.branchIndex },
    { label: '월운', stemIndex: currentPillars.monthlyUn.stemIndex, branchIndex: currentPillars.monthlyUn.branchIndex },
    { label: '일운', stemIndex: currentPillars.dailyUn.stemIndex, branchIndex: currentPillars.dailyUn.branchIndex },
  ];

  const results = [];
  for (const cur of currents) {
    const curHanja = pillarLabel(cur.stemIndex, cur.branchIndex).hanja;
    for (const tgt of targets) {
      if (cur.stemIndex === tgt.stemIndex) continue; // 동일 천간은 합충 대상 아님

      const combo = STEM_COMBINE_PAIRS.find(
        (c) => (c.pair[0] === cur.stemIndex && c.pair[1] === tgt.stemIndex) ||
               (c.pair[1] === cur.stemIndex && c.pair[0] === tgt.stemIndex)
      );
      if (combo) {
        results.push({
          current: cur.label, currentHanja: curHanja, currentStemIndex: cur.stemIndex,
          target: tgt.label, targetHanja: STEM_HANJA[tgt.stemIndex], targetStemIndex: tgt.stemIndex,
          type: '천간합', resultElement: combo.result, isDayMaster: tgt.label === '일간',
        });
      }

      const isClash = STEM_CLASH_PAIRS.some(
        ([a, b]) => (a === cur.stemIndex && b === tgt.stemIndex) || (b === cur.stemIndex && a === tgt.stemIndex)
      );
      if (isClash) {
        results.push({
          current: cur.label, currentHanja: curHanja, currentStemIndex: cur.stemIndex,
          target: tgt.label, targetHanja: STEM_HANJA[tgt.stemIndex], targetStemIndex: tgt.stemIndex,
          type: '천간충', resultElement: null, isDayMaster: tgt.label === '일간',
        });
      }
    }
  }
  return results;
}

// 천간 자리(연간/월간/일간/시간)가 뜻하는 인생 영역
const STEM_POSITION_DOMAIN = {
  연간: '조상·어린 시절·초년운과 관련된 영역',
  월간: '부모형제·사회 초년·직장 기반과 관련된 영역',
  일간: '본인 자신의 정체성·건강·의사결정과 관련된 영역',
  시간: '자녀·아랫사람·말년운과 관련된 영역',
};

/**
 * 지금 흐르는 대운이 원국(연/월/일/시주)과 어떤 형충회합을 이루는지 분석해,
 * 이 10년간 원국이 어떻게 변화하는지 해석한다. (사주 원국 설명 보충용)
 */
// 십성 그룹별 구체적인 사례 (대운 해석 보충용)
const TEN_GOD_GROUP_EXAMPLES = {
  비겁: '동업이나 협업 제안, 친구·형제와의 갈등 혹은 의기투합, 경쟁 상황의 심화',
  식상: '이직이나 이사, 자녀와 관련된 소식, 창작·발표 등 표현 활동의 변화',
  재성: '급여·투자의 변동, 예상치 못한 지출이나 수입, 이성과의 만남이나 갈등',
  관성: '승진이나 인사이동, 계약·소송 관련 이슈, 조직 내 위치·책임의 변화',
  인성: '자격증·학업 관련 소식, 중요한 문서·계약, 부동산이나 어머니·스승과 관련된 일',
};

function getDaewoonEffectOnChart(fourPillars, daewoonPillar) {
  const daewoonHanja = pillarLabel(daewoonPillar.stemIndex, daewoonPillar.branchIndex).hanja;
  const dayStemIndex = fourPillars.day.stemIndex;
  const branchTargets = [
    { label: '연지', branchIndex: fourPillars.year.branchIndex, hanja: BRANCH_HANJA[fourPillars.year.branchIndex] },
    { label: '월지', branchIndex: fourPillars.month.branchIndex, hanja: BRANCH_HANJA[fourPillars.month.branchIndex] },
    { label: '일지', branchIndex: fourPillars.day.branchIndex, hanja: BRANCH_HANJA[fourPillars.day.branchIndex] },
    { label: '시지', branchIndex: fourPillars.hour.branchIndex, hanja: BRANCH_HANJA[fourPillars.hour.branchIndex] },
  ];
  const stemTargets = [
    { label: '연간', stemIndex: fourPillars.year.stemIndex },
    { label: '월간', stemIndex: fourPillars.month.stemIndex },
    { label: '일간', stemIndex: fourPillars.day.stemIndex },
    { label: '시간', stemIndex: fourPillars.hour.stemIndex },
  ];

  const pairMatch = (pairs, a, b) => pairs.some(([x, y]) => (x === a && y === b) || (y === a && x === b));
  const items = [];

  for (const tgt of branchTargets) {
    let type = null;
    let detail = null;
    if (daewoonPillar.branchIndex === tgt.branchIndex && BRANCH_SELF_PUNISH.includes(tgt.branchIndex)) {
      type = '형'; detail = '자형';
    } else if (pairMatch(BRANCH_CLASH_PAIRS, daewoonPillar.branchIndex, tgt.branchIndex)) {
      type = '충';
    } else if (pairMatch(BRANCH_COMBINE_PAIRS, daewoonPillar.branchIndex, tgt.branchIndex)) {
      type = '합';
    } else if (pairMatch(BRANCH_BREAK_PAIRS, daewoonPillar.branchIndex, tgt.branchIndex)) {
      type = '파';
    } else if (pairMatch(BRANCH_HARM_PAIRS, daewoonPillar.branchIndex, tgt.branchIndex)) {
      type = '해';
    } else if (pairMatch(BRANCH_MUTUAL_PUNISH_PAIRS, daewoonPillar.branchIndex, tgt.branchIndex)) {
      type = '형'; detail = '상형';
    } else {
      for (const group of BRANCH_TRIPLE_PUNISH_GROUPS) {
        if (group.includes(daewoonPillar.branchIndex) && group.includes(tgt.branchIndex) && daewoonPillar.branchIndex !== tgt.branchIndex) {
          type = '형'; detail = '삼형';
        }
      }
    }
    if (type) {
      const godName = tenGodOfBranch(dayStemIndex, tgt.branchIndex);
      const godGroup = TEN_GOD_GROUP[godName] || '비겁';
      items.push({
        target: tgt.label, targetHanja: tgt.hanja, type, detail, domain: POSITION_DOMAIN[tgt.label],
        tenGod: godName, tenGodGroup: godGroup,
      });
    }
  }

  for (const tgt of stemTargets) {
    if (daewoonPillar.stemIndex === tgt.stemIndex) continue;
    const godName = tenGod(dayStemIndex, tgt.stemIndex);
    const godGroup = TEN_GOD_GROUP[godName] || '비겁';
    const combo = STEM_COMBINE_PAIRS.find(
      (c) => (c.pair[0] === daewoonPillar.stemIndex && c.pair[1] === tgt.stemIndex) ||
             (c.pair[1] === daewoonPillar.stemIndex && c.pair[0] === tgt.stemIndex)
    );
    if (combo) {
      items.push({
        target: tgt.label, targetHanja: STEM_HANJA[tgt.stemIndex], type: '천간합', resultElement: combo.result,
        domain: STEM_POSITION_DOMAIN[tgt.label], tenGod: godName, tenGodGroup: godGroup,
      });
    }
    const isClash = STEM_CLASH_PAIRS.some(
      ([a, b]) => (a === daewoonPillar.stemIndex && b === tgt.stemIndex) || (b === daewoonPillar.stemIndex && a === tgt.stemIndex)
    );
    if (isClash) {
      items.push({
        target: tgt.label, targetHanja: STEM_HANJA[tgt.stemIndex], type: '천간충',
        domain: STEM_POSITION_DOMAIN[tgt.label], tenGod: godName, tenGodGroup: godGroup,
      });
    }
  }

  if (items.length === 0) {
    return {
      hasEffect: false, items: [],
      summary: `지금 흐르는 대운(${daewoonHanja})은 원국의 연·월·일·시주와 직접적인 형충회합 없이, ` +
        `비교적 안정적으로 원국의 기존 흐름을 이어가는 10년입니다.`,
    };
  }

  const TYPE_ACTION = {
    충: '강하게 충돌시켜', 합: '부드럽게 결합시켜', 형: '날카롭게 부딪히게 하여',
    파: '조금씩 흔들어 깨뜨려', 해: '은근히 훼방을 놓아',
    천간합: '표면적으로 결합시켜', 천간충: '정면으로 충돌시켜',
  };
  const sentences = items.map((it) => {
    const action = TYPE_ACTION[it.type] || '자극하여';
    const objParticle = pickParticle(it.target, '을', '를');
    const example = TEN_GOD_GROUP_EXAMPLES[it.tenGodGroup] || '크고 작은 환경 변화';
    return `대운(${daewoonHanja})이 ${it.target}(${it.targetHanja}, ${it.tenGodGroup})${objParticle} ${action}, ` +
      `이 10년간 ${it.domain}에서 변화가 지속됩니다. 구체적으로는 ${example} 등의 형태로 나타날 수 있습니다.`;
  });

  return {
    hasEffect: true,
    items,
    summary: sentences.join(' '),
  };
}

function findAmhap(fourPillars, daewoonPillar, currentPillars) {
  const dayBranchIndex = fourPillars.day.branchIndex;
  const dayHidden = BRANCH_HIDDEN_STEMS[dayBranchIndex];

  const others = [
    { label: '연지', branchIndex: fourPillars.year.branchIndex },
    { label: '월지', branchIndex: fourPillars.month.branchIndex },
    { label: '시지', branchIndex: fourPillars.hour.branchIndex },
    { label: '대운', branchIndex: daewoonPillar.branchIndex },
    { label: '세운', branchIndex: currentPillars.seyun.branchIndex },
    { label: '월운', branchIndex: currentPillars.monthlyUn.branchIndex },
    { label: '일운', branchIndex: currentPillars.dailyUn.branchIndex },
  ];

  const results = [];
  for (const other of others) {
    if (other.branchIndex === dayBranchIndex) continue; // 같은 지지끼리는 암합으로 보지 않음
    const otherHidden = BRANCH_HIDDEN_STEMS[other.branchIndex];

    for (const dh of dayHidden) {
      for (const oh of otherHidden) {
        const combo = STEM_COMBINE_PAIRS.find(
          (c) => (c.pair[0] === dh && c.pair[1] === oh) || (c.pair[1] === dh && c.pair[0] === oh)
        );
        if (!combo) continue;

        const domain = POSITION_DOMAIN[other.label] || '';
        const theme = AMHAP_ELEMENT_THEME[combo.result];
        const themeParticle = pickParticle(theme, '이', '가');

        results.push({
          target: other.label,
          targetHanja: BRANCH_HANJA[other.branchIndex],
          dayHiddenStem: STEMS[dh],
          dayHiddenStemHanja: STEM_HANJA[dh],
          otherHiddenStem: STEMS[oh],
          otherHiddenStemHanja: STEM_HANJA[oh],
          resultElement: combo.result,
          description:
            `일지(${BRANCH_HANJA[dayBranchIndex]}) 속 ${STEMS[dh]}(${STEM_HANJA[dh]})${pickParticle(STEMS[dh], '과', '와')} ${other.label}(${BRANCH_HANJA[other.branchIndex]}) 속 ` +
            `${STEMS[oh]}(${STEM_HANJA[oh]})${pickParticle(STEMS[oh], '이', '가')} 암합하여 ${combo.result} 기운으로 은밀히 결합합니다. ` +
            `${domain}에서 겉으로 드러나지 않는 ${theme}${themeParticle} 작용할 수 있습니다.`,
        });
      }
    }
  }
  return results;
}

/**
 * 원국+대운(기반) 속에 삼합의 2글자가 이미 갖춰진 상태에서, 트리거(세운/월운/일운)가
 * 나머지 1글자를 가져와 삼합을 완성하는지 탐지한다.
 */
function findSamhapCompletion(baseList, trigger) {
  const results = [];
  for (const group of SAMHAP_GROUPS) {
    const presentInBase = baseList.filter((b) => group.branches.includes(b.branchIndex));
    const presentValues = presentInBase.map((b) => b.branchIndex);
    const missing = group.branches.filter((br) => !presentValues.includes(br));

    if (missing.length === 1 && missing[0] === trigger.branchIndex) {
      results.push({
        element: group.element,
        name: group.name,
        matchedLabels: presentInBase.map((b) => `${b.label}(${b.hanja})`).join('·'),
        involvedBranchIndices: [...group.branches], // 삼합을 이루는 3글자 전체 (재자극 판정에 사용)
      });
    }
  }
  return results;
}

// 형충회합 유형별 등급(계층) 분류
// tier1: 삼합완성·충 — 삶의 방향이 결정되는 핵심 사건급
// tier2: 합(육합) — 개인적 관계가 새로 맺어지는 수준
// tier3: 형·파·해 — 국지적으로 나타나는 조정·갈등 수준
const TIER_BY_TYPE = { 삼합: 1, 충: 1, 합: 2, 형: 3, 파: 3, 해: 3 };
const TIER_LABEL = { 1: '핵심 사건', 2: '관계 결속', 3: '국지적 조정' };

const TYPE_HANJA = { 충: '沖', 합: '合', 형: '刑', 파: '破', 해: '害' };

/**
 * 대운=판(Stage) / 세운=사건(Event) / 월운·일운=시기·촉발(Trigger) 구조에 따라
 * "무엇이 일어나는가(세운 vs 원국+대운)"와 "언제 구체화되는가(월운·일운 vs 원국+대운)"를
 * 구분해서 해석한다. (임상 통변 방식을 간이화한 참고용 해석)
 */
// 형충회합 유형의 성격 — 화합(合) 계열인지 충돌(沖) 계열인지
const VALENCE_BY_TYPE = {
  삼합: 'harmony', 합: 'harmony', 천간합: 'harmony',
  충: 'conflict', 형: 'conflict', 파: 'conflict', 해: 'conflict', 천간충: 'conflict',
};

function buildFortuneNarrative(fourPillars, daewoonPillar, currentPillars, interactions, stemInteractions) {
  const baseList = [
    { label: '연지', branchIndex: fourPillars.year.branchIndex, hanja: BRANCH_HANJA[fourPillars.year.branchIndex] },
    { label: '월지', branchIndex: fourPillars.month.branchIndex, hanja: BRANCH_HANJA[fourPillars.month.branchIndex] },
    { label: '일지', branchIndex: fourPillars.day.branchIndex, hanja: BRANCH_HANJA[fourPillars.day.branchIndex] },
    { label: '시지', branchIndex: fourPillars.hour.branchIndex, hanja: BRANCH_HANJA[fourPillars.hour.branchIndex] },
    { label: '대운', branchIndex: daewoonPillar.branchIndex, hanja: BRANCH_HANJA[daewoonPillar.branchIndex] },
  ];

  const buildTierDescription = (i, tier) => {
    const objParticle = pickParticle(i.target, '을', '를');
    if (tier === 1 && i.type === '삼합') {
      return `${i.current}(${i.currentHanja})이(가) 원국·대운에 이미 갖춰진 ${i.samhapMatch}와(과) 손잡아 ` +
        `${i.samhapElement} 삼합(三合)을 완성합니다. 환경이 통째로 바뀌는 수준의 변곡점으로, ` +
        `이직·창업·이사·결혼처럼 인생의 큰 방향이 결정되는 사건이 나타날 수 있습니다.`;
    }
    if (tier === 1 && i.type === '충') {
      return `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})${objParticle} 강하게 충(沖)합니다. ` +
        `에너지가 정면으로 부딪히는 형국이라, 건강 문제·이별·사건사고·이사나 이직처럼 ` +
        `신속하고 뚜렷하게 체감되는 변화가 나타날 수 있습니다.`;
    }
    if (i.type === '천간합') {
      const targetPhrase = i.isDayMaster ? '일간' : i.target;
      const tail = i.isDayMaster
        ? '본인의 판단 기준이나 정체성이 새로운 방향으로 바뀌거나, 중요한 계약·결합이 이뤄질 수 있습니다.'
        : '표면적인 관계나 입장에서 새로운 협력이 나타날 수 있습니다.';
      return `${i.current}(${i.currentHanja})의 천간이 ${targetPhrase}(${i.targetHanja})과 합(合)하여 ${i.resultElement} 기운으로 화(化)합니다. ${tail}`;
    }
    if (i.type === '천간충') {
      const targetPhrase = i.isDayMaster ? '일간' : i.target;
      const tail = i.isDayMaster
        ? '본인의 마음가짐·건강·의사결정이 크게 흔들리는 시기로, 뜻하지 않은 변화나 심경 변화가 나타날 수 있습니다.'
        : '표면적인 관계나 입장에서 마찰이 있을 수 있습니다.';
      return `${i.current}(${i.currentHanja})의 천간이 ${targetPhrase}(${i.targetHanja})을(를) 충(沖)합니다. ${tail}`;
    }
    if (tier === 2) {
      return `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})와(과) 합(合)을 이룹니다. ` +
        `연애·계약·협력처럼 개인적으로 밀접하게 묶이는 관계가 새롭게 형성될 수 있습니다.`;
    }
    return `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})와(과) ${i.type}(${TYPE_HANJA[i.type]})의 ` +
      `관계를 이룹니다. 조정·수리·갈등·법적 절차처럼 다소 복잡한 양상이 국지적으로 나타날 수 있습니다.`;
  };

  // 1) 세운 vs (원국+대운) — "무엇이 일어나는가" (핵심 사건 후보)
  const seyunInteractions = interactions.filter((i) => i.current === '세운');
  const seyunStemInteractions = stemInteractions.filter((i) => i.current === '세운');
  const samhapBySeyun = findSamhapCompletion(baseList, { branchIndex: currentPillars.seyun.branchIndex });

  const coreEvents = [];
  const coreBranchIndices = new Set(); // 하위 호환용 (전체 재현 판정)
  const coreStemIndices = new Set();
  const attackerBranchIndices = new Set();   // 세운(공격 주체) 쪽 글자
  const victimBranchIndices = new Set();     // 원국·대운(피격 자리) 쪽 글자
  const attackerStemIndices = new Set();
  const victimStemIndices = new Set();
  const samhapMaterialBranchIndices = new Set(); // 삼합 재료(공수 구분 없음)
  const branchValenceMap = new Map(); // branchIndex → Set('harmony'|'conflict') — 그 글자가 세운에서 어떤 성격으로 쓰였는지
  const stemValenceMap = new Map();

  const addValence = (map, key, valence) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(valence);
  };

  for (const s of samhapBySeyun) {
    const item = {
      current: '세운', currentHanja: pillarLabel(currentPillars.seyun.stemIndex, currentPillars.seyun.branchIndex).hanja,
      target: s.matchedLabels, targetHanja: '', type: '삼합', detail: s.name,
      samhapMatch: s.matchedLabels, samhapElement: s.element,
      tier: 1, tierLabel: TIER_LABEL[1],
    };
    item.description = buildTierDescription(item, 1);
    coreEvents.push(item);
    s.involvedBranchIndices.forEach((b) => {
      coreBranchIndices.add(b); samhapMaterialBranchIndices.add(b);
      addValence(branchValenceMap, b, 'harmony');
    });
  }
  for (const i of seyunInteractions) {
    const tier = TIER_BY_TYPE[i.type] || 3;
    const item = { ...i, tier, tierLabel: TIER_LABEL[tier] };
    item.description = buildTierDescription(item, tier);
    coreEvents.push(item);
    coreBranchIndices.add(i.currentBranchIndex);
    coreBranchIndices.add(i.targetBranchIndex);
    attackerBranchIndices.add(i.currentBranchIndex);
    victimBranchIndices.add(i.targetBranchIndex);
    const valence = VALENCE_BY_TYPE[i.type] || 'conflict';
    addValence(branchValenceMap, i.currentBranchIndex, valence);
    addValence(branchValenceMap, i.targetBranchIndex, valence);
  }
  for (const i of seyunStemInteractions) {
    const tier = i.isDayMaster ? 1 : 2;
    const item = { ...i, tier, tierLabel: i.isDayMaster ? '핵심 사건(일간)' : TIER_LABEL[tier] };
    item.description = buildTierDescription(item, tier);
    coreEvents.push(item);
    coreStemIndices.add(i.currentStemIndex);
    coreStemIndices.add(i.targetStemIndex);
    attackerStemIndices.add(i.currentStemIndex);
    victimStemIndices.add(i.targetStemIndex);
    const valence = VALENCE_BY_TYPE[i.type] || 'conflict';
    addValence(stemValenceMap, i.currentStemIndex, valence);
    addValence(stemValenceMap, i.targetStemIndex, valence);
  }
  coreEvents.sort((a, b) => a.tier - b.tier);

  // 재현된 글자가 "세운(공격 주체)" 쪽인지 "원국·대운(피격 자리)" 쪽인지 판정
  const classifyRole = (branchOrStemIndex, attackerSet, victimSet) => {
    if (attackerSet.has(branchOrStemIndex)) return 'attacker';
    if (victimSet.has(branchOrStemIndex)) return 'victim';
    return null;
  };

  // 2) 월운/일운 vs (원국+대운) — "언제 구체화되는가" (시기·촉발)
  // 세운 사건에 실제로 쓰인 글자(지지/천간)를 월운·일운이 "다시" 가져올 때만 그 사건의
  // 촉발로 보고, 무관한 글자의 형충회합은 별개의 경미한 신호(해프닝)로 구분한다.
  const hasCoreEvent = coreEvents.length > 0;
  const timingEvents = [];

  for (const label of ['월운', '일운']) {
    const branchIndex = label === '월운' ? currentPillars.monthlyUn.branchIndex : currentPillars.dailyUn.branchIndex;
    const hanja = label === '월운'
      ? pillarLabel(currentPillars.monthlyUn.stemIndex, currentPillars.monthlyUn.branchIndex).hanja
      : pillarLabel(currentPillars.dailyUn.stemIndex, currentPillars.dailyUn.branchIndex).hanja;

    const samhapHere = findSamhapCompletion(baseList, { branchIndex });
    for (const s of samhapHere) {
      const objParticle = pickParticle(s.name, '을', '를');
      const reinforces = s.involvedBranchIndices.some((b) => coreBranchIndices.has(b));
      timingEvents.push({
        current: label, currentHanja: hanja, target: s.matchedLabels, targetHanja: '', type: '삼합', detail: s.name,
        reinforces, role: reinforces ? 'material' : null,
        description: reinforces
          ? `${label}(${hanja})이(가) 원국·대운의 ${s.matchedLabels}와(과) 결합해 ${s.element} 삼합${objParticle} 완성하며, ` +
            `세운 사건에 쓰인 글자를 다시 자극합니다. 세운에서 예고된 사건이 실제로 구체화되는 시점(이 시기)으로 볼 수 있습니다.`
          : `${label}(${hanja})이(가) ${s.matchedLabels}와(과) ${s.element} 삼합을 이루지만, 세운 사건과는 무관한 글자의 조합이라 ` +
            `인생을 바꿀 사건보다는 짧게 지나가는 독립적인 변화 정도로 볼 수 있습니다.`,
      });
    }

    const layerInteractions = interactions.filter((i) => i.current === label);
    for (const i of layerInteractions) {
      const objParticle = pickParticle(i.target, '을', '를');
      const role = classifyRole(i.currentBranchIndex, attackerBranchIndices, victimBranchIndices) ||
                   (victimBranchIndices.has(i.targetBranchIndex) ? 'victim' : null) ||
                   (samhapMaterialBranchIndices.has(i.currentBranchIndex) ? 'material' : null);
      const reinforces = role !== null;

      // 재현된 그 글자가 세운에서 화합(合) 계열로 쓰였는지 충돌(沖) 계열로 쓰였는지와,
      // 지금 이 시기의 작용이 같은 성격인지 반대 성격인지 비교한다.
      const matchedBranch = role === 'attacker' ? i.currentBranchIndex
        : (victimBranchIndices.has(i.targetBranchIndex) ? i.targetBranchIndex : i.currentBranchIndex);
      const coreValences = branchValenceMap.get(matchedBranch);
      const thisValence = VALENCE_BY_TYPE[i.type] || 'conflict';
      const isReversal = reinforces && coreValences && !coreValences.has(thisValence);

      let description;
      if (isReversal && coreValences.has('harmony')) {
        description = `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})${objParticle} ${i.type}(${TYPE_HANJA[i.type] || ''})합니다. ` +
          `세운이 맺어놓았던 화합(合)이 이번 시기에 흔들립니다. 순조롭게 이어지던 관계나 결합에 균열이 생기거나, ` +
          `다시 조율이 필요한 상황이 올 수 있습니다.`;
      } else if (isReversal && coreValences.has('conflict')) {
        description = `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})${objParticle} ${i.type}(${TYPE_HANJA[i.type] || ''})합니다. ` +
          `세운에서 벌어졌던 충돌이 이번 시기에 화합으로 누그러집니다. 갈등이 완화되거나 화해·타협의 계기가 마련될 수 있습니다.`;
      } else if (reinforces) {
        const roleTail = role === 'attacker'
          ? '세운의 그 기운 자체가 이 시기에 다시 강하게 작동한다는 뜻으로, 세운이 예고한 흐름이 재확인됩니다.'
          : role === 'victim'
            ? '세운에게 얻어맞았던 바로 그 자리(원국·대운)가 이 시기에 또 한 번 직접 흔들린다는 뜻으로, 피해·변화가 그 영역에 집중됩니다.'
            : '세운 재료가 다시 얽히는 신호로, 사건이 구체화되는 시점으로 볼 수 있습니다.';
        description = `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})${objParticle} 다시 ${i.type}(${TYPE_HANJA[i.type] || ''})합니다. ${roleTail}`;
      } else {
        description = `${i.current}(${i.currentHanja})이(가) ${i.target}(${i.targetHanja})${objParticle} ${i.type}(${TYPE_HANJA[i.type] || ''})하지만, ` +
          `세운 사건에 쓰인 글자와는 무관해 하루·한 달 내 지나가는 가벼운 해프닝(사소한 다툼, 자잘한 지출, 일시적 기분 변화 등) 수준에 그칠 가능성이 높습니다.`;
      }

      timingEvents.push({ ...i, reinforces, role: isReversal ? 'reversal' : role, description });
    }

    const layerStemInteractions = stemInteractions.filter((i) => i.current === label);
    for (const i of layerStemInteractions) {
      const targetPhrase = i.isDayMaster ? '일간' : i.target;
      const objParticle = pickParticle(targetPhrase, '을', '를');
      const role = classifyRole(i.currentStemIndex, attackerStemIndices, victimStemIndices) ||
                   (victimStemIndices.has(i.targetStemIndex) ? 'victim' : null);
      const reinforces = role !== null;

      const matchedStem = role === 'attacker' ? i.currentStemIndex
        : (victimStemIndices.has(i.targetStemIndex) ? i.targetStemIndex : i.currentStemIndex);
      const coreValences = stemValenceMap.get(matchedStem);
      const thisValence = VALENCE_BY_TYPE[i.type] || 'conflict';
      const isReversal = reinforces && coreValences && !coreValences.has(thisValence);

      let description;
      if (isReversal && coreValences.has('harmony')) {
        description = `${i.current}(${i.currentHanja})의 천간이 ${targetPhrase}(${i.targetHanja})${i.type === '천간합' ? '과 합(合)합니다' : objParticle + ' 충(沖)합니다'}. ` +
          `세운이 맺어놓았던 화합이 이번 시기에 흔들립니다. 순조롭던 관계나 결합에 균열이 생기거나 재조율이 필요할 수 있습니다.`;
      } else if (isReversal && coreValences.has('conflict')) {
        description = `${i.current}(${i.currentHanja})의 천간이 ${targetPhrase}(${i.targetHanja})${i.type === '천간합' ? '과 합(合)합니다' : objParticle + ' 충(沖)합니다'}. ` +
          `세운에서 벌어졌던 충돌이 이번 시기에 화합으로 누그러지며, 갈등 완화나 화해의 계기가 마련될 수 있습니다.`;
      } else if (reinforces) {
        const roleTail = role === 'attacker'
          ? '세운 천간의 그 기운 자체가 이 시기에 다시 강하게 작동합니다.'
          : '세운에게 작용을 받았던 바로 그 천간 자리가 이 시기에 또 한 번 직접 흔들립니다.';
        description = `${i.current}(${i.currentHanja})의 천간이 ${targetPhrase}(${i.targetHanja})${i.type === '천간합' ? '과 다시 합(合)합니다' : objParticle + ' 다시 충(沖)합니다'}. ${roleTail}`;
      } else {
        description = `${i.current}(${i.currentHanja})의 천간이 ${targetPhrase}(${i.targetHanja})${i.type === '천간합' ? '과 합(合)합니다' : objParticle + ' 충(沖)합니다'}. ` +
          `세운 사건에 쓰인 천간과는 무관해 ${i.isDayMaster ? '하루·한 달 내의 심경 변화 정도' : '가벼운 해프닝 수준'}에 그칠 가능성이 높습니다.`;
      }

      timingEvents.push({ ...i, reinforces, role: isReversal ? 'reversal' : role, description });
    }
  }

  return { coreEvents, timingEvents, hasCoreEvent };
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

  const currentPillars = {
    seyun: yearPillarToday,
    monthlyUn: monthPillarToday,
    dailyUn: dayPillarToday,
  };

  const seyunElement = STEM_ELEMENT[yearPillarToday.stemIndex];
  const luckState = judgeFortune(seyunElement, dayMasterElement);
  const season = BRANCH_SEASON[monthPillarToday.branchIndex];

  const gyeokguk = judgeGyeokguk(fourPillars);
  const strength = judgeStrength(fourPillars, daewoon);
  const yongsin = judgeYongsinFull(fourPillars, dayMasterElement, season, strength);
  const interactions = findInteractions(fourPillars, daewoon, currentPillars);
  const stemInteractions = findStemInteractions(fourPillars, daewoon, currentPillars);
  const fortuneNarrative = buildFortuneNarrative(fourPillars, daewoon, currentPillars, interactions, stemInteractions);
  const amhap = findAmhap(fourPillars, daewoon, currentPillars);
  const daewoonEffect = getDaewoonEffectOnChart(fourPillars, daewoon);
  const climate = judgeClimate(fourPillars, daewoon);
  const daySymbol = getDaySymbol(fourPillars);
  const situationPhrase = getSituationPhrase(fortuneNarrative.coreEvents, fortuneNarrative.timingEvents, daySymbol.animal);

  // 일운 이미지 디테일: 오늘 실제로 일어난 형충회합 중 가장 중요한 것을 우선 반영 (형 > 충 > 해 > 합)
  const priority = { 형: 4, 충: 3, 해: 2, 합: 1 };
  const dailyEvents = interactions.filter(i => i.current === '일운' || i.current === '세운' || i.current === '월운');
  let dailyDetail;
  if (dailyEvents.length > 0) {
    dailyEvents.sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0));
    const top = dailyEvents[0].type;
    // DAILY_DETAIL 사전 키는 '충/형'·'합'·'재성운'·'인성운' 뿐이므로 매핑
    dailyDetail = top === '합' ? '합' : '충/형';
  } else {
    dailyDetail = judgeDailyDetail(dayPillarToday, fourPillars.day);
  }

  return {
    fourPillars,
    coreElement: dayMasterElement,
    gyeokguk,
    strength,
    yongsin,
    interactions,
    predictedEvents: fortuneNarrative.coreEvents,
    timingEvents: fortuneNarrative.timingEvents,
    hasCoreEvent: fortuneNarrative.hasCoreEvent,
    amhap,
    daewoonEffect,
    climate,
    daySymbol,
    situationPhrase,
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
  tenGod,
  findInteractions,
  findStemInteractions,
  buildFortuneNarrative,
  findAmhap,
  judgeClimate,
  getDaySymbol,
  getSituationPhrase,
  getElementAttrs,
  getDaewoonEffectOnChart,
  STEMS,
  BRANCHES,
  STEM_ELEMENT,
  BRANCH_ELEMENT,
};
