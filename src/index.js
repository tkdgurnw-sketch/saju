require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const path = require('path');

const visualizeRouter = require('./routes/visualize');
const { expireOutdatedImages } = require('./jobs/expireImagesJob');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 크롭된 webp 이미지를 정적 파일로 공개 (실서비스에서는 S3/CDN으로 대체)
const OUTPUT_DIR = process.env.LOCAL_OUTPUT_DIR || './storage/cropped';
app.use('/images', express.static(path.resolve(OUTPUT_DIR)));

app.use('/api/v1/saju', visualizeRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// 매일 새벽 4시 TTL 만료 배치 실행
cron.schedule('0 4 * * *', () => {
  expireOutdatedImages().catch((err) => console.error('[cron] TTL job 실패', err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`사주 시각화 백엔드 서버 실행 중: http://localhost:${PORT}`);
});