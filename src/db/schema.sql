-- 사주팔자 시각화 백엔드 스키마
-- 원본 이미지(그리드)는 URL만 저장, 크롭본만 실제 스토리지 비용 발생

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(50) PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_saju_profiles (
    profile_id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    core_element VARCHAR(10) NOT NULL,
    bazi_data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saju_visualizations (
    visualization_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    style_type VARCHAR(20) NOT NULL,      -- ORIENTAL, MINIMAL, 3D
    saju_type VARCHAR(10) NOT NULL,       -- DAILY, MONTHLY, DAEWUN
    analysis_summary TEXT NOT NULL,
    analysis_details JSONB NOT NULL,
    applied_prompt TEXT NOT NULL,
    source_image_url TEXT NOT NULL,       -- 원본 생성 이미지(그리드 또는 단일) URL
    image_path_u1 TEXT,
    image_path_u2 TEXT,
    image_path_u3 TEXT,
    image_path_u4 TEXT,
    is_image_expired BOOLEAN DEFAULT FALSE,
    expire_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saju_visual_user_date ON saju_visualizations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saju_visual_expire ON saju_visualizations(expire_at) WHERE is_image_expired = FALSE;
