// R2 자격증명이 실제로 유효한지 Railway와 무관하게 로컬에서 직접 확인하는 테스트 스크립트입니다.
// 사용법: saju-backend 폴더에서 `node test-r2.js` 실행
// (이미 npm install로 @aws-sdk/client-s3가 설치되어 있어야 합니다)

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ↓↓↓ 방금 새로 발급받은 값으로 정확히 채워주세요 ↓↓↓
const R2_ENDPOINT = 'https://e3df89544f0ae2e2d3ea5f4c1943a959.r2.cloudflarestorage.com';
const R2_ACCESS_KEY_ID = '638ca6b65ede1f4d7e6c9d29d99fd816';
const R2_SECRET_ACCESS_KEY = 'a4c0108b8bffe7eb0b4920deb0f92dd52675163891a20efd93c148c18a22de62';
const R2_BUCKET_NAME = 'saju-images';
// ↑↑↑ 여기까지 ↑↑↑

console.log('--- 값 확인 (길이만 출력, 실제 값 노출 방지) ---');
console.log('ENDPOINT:', R2_ENDPOINT);
console.log('ACCESS_KEY_ID length:', R2_ACCESS_KEY_ID.length, '(정상이면 32)');
console.log('SECRET_ACCESS_KEY length:', R2_SECRET_ACCESS_KEY.length, '(정상이면 64)');
console.log('BUCKET:', R2_BUCKET_NAME);
console.log('---------------------------------------------');

const client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

(async () => {
  try {
    const res = await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: 'local-test-upload.txt',
        Body: Buffer.from('로컬 테스트 업로드 - ' + new Date().toISOString()),
        ContentType: 'text/plain',
      })
    );
    console.log('✅ 성공! 업로드가 정상적으로 됐습니다.');
    console.log(res);
  } catch (err) {
    console.log('❌ 실패했습니다.');
    console.error(err);
  }
})();
