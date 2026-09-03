# 사주팔자 시각화 백엔드

## 구성
- `src/services/promptEngine.js` — 스타일(ORIENTAL/MINIMAL/3D) × 사주 데이터(원국/대운/월운/일운) 프롬프트 조립
- `src/services/imageProvider.js` — 이미지 생성 (정식 REST API, 기본값: Stability AI)
- `src/services/imageProcessor.js` — 4분할 그리드 크롭 또는 단일 이미지 → webp(quality 85) 변환
- `src/services/visualizationService.js` — 위 과정을 엮는 오케스트레이션 레이어
- `src/db/schema.sql` — PostgreSQL 스키마 (users / user_saju_profiles / saju_visualizations)
- `src/jobs/expireImagesJob.js` — DAILY 이미지 TTL(기본 7일) 만료 배치
- `src/routes/visualize.js` — `POST /api/v1/saju/visualize`

## 왜 Discord 셀프봇을 쓰지 않았는가
원래 요청에는 `discord.js-selfbot-v13`으로 사용자 토큰을 이용해 `/imagine`을 자동 실행하는
방식이 포함되어 있었습니다. 이는 Discord 이용약관이 금지하는 "셀프봇"(사람 계정을 자동화 스크립트가
사칭하는 방식)이라 계정 정지 위험이 있고, Midjourney 이용약관도 위반하게 됩니다. 그래서 이 프로젝트는
**정식 REST API 키로 인증하는 이미지 생성 서비스**(Stability AI 예시)를 사용하도록 구성했습니다.

## 다른 이미지 생성 API로 교체하는 법
`src/services/imageProvider.js`의 `generateImage(prompt)` 함수만 교체하면 됩니다.
반환 형태(`{ type, buffer, providerRef }`)만 유지하면 나머지 파이프라인(크롭/저장/DB/응답)은 그대로 재사용됩니다.
- 그리드(2x2) 이미지를 반환하는 API → `type: 'grid'`로 반환하면 자동으로 4분할 크롭됩니다.
- 단일 이미지를 반환하는 API → `type: 'single'`로 반환하면 U1에만 채워지고 U2~U4는 null 처리됩니다.

## 실행
```bash
cp .env.example .env   # 값 채우기
npm install
psql $DATABASE_URL -f src/db/schema.sql
npm start
```

## TTL 배치 수동 실행
```bash
npm run cron:cleanup
```
