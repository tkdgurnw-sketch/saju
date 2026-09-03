/**
 * expire_at이 지난 DAILY 이미지의 크롭 파일을 삭제하고
 * DB 상에서는 텍스트 데이터를 보존한 채 이미지 경로만 NULL 처리한다.
 *
 * 실행 방법:
 *   node src/jobs/expireImagesJob.js       (1회 수동 실행)
 *   node-cron으로 스케줄 등록 시 index.js에서 import하여 사용
 */

const fs = require('fs/promises');
const db = require('../config/db');

async function expireOutdatedImages() {
  const { rows } = await db.query(
    `SELECT visualization_id, image_path_u1, image_path_u2, image_path_u3, image_path_u4
     FROM saju_visualizations
     WHERE is_image_expired = FALSE
       AND expire_at IS NOT NULL
       AND expire_at < NOW()`
  );

  console.log(`[TTL] 만료 대상 ${rows.length}건`);

  for (const row of rows) {
    const paths = [row.image_path_u1, row.image_path_u2, row.image_path_u3, row.image_path_u4]
      .filter(Boolean);

    await Promise.all(
      paths.map((p) =>
        fs.unlink(p).catch((err) => {
          // 실서비스에서는 S3 deleteObject 등으로 교체. 파일이 이미 없으면 조용히 넘어감.
          if (err.code !== 'ENOENT') console.error(`[TTL] 삭제 실패: ${p}`, err.message);
        })
      )
    );

    await db.query(
      `UPDATE saju_visualizations
       SET image_path_u1 = NULL, image_path_u2 = NULL,
           image_path_u3 = NULL, image_path_u4 = NULL,
           is_image_expired = TRUE
       WHERE visualization_id = $1`,
      [row.visualization_id]
    );
  }

  console.log('[TTL] 만료 처리 완료');
}

if (require.main === module) {
  expireOutdatedImages()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TTL] 작업 실패', err);
      process.exit(1);
    });
}

module.exports = { expireOutdatedImages };
