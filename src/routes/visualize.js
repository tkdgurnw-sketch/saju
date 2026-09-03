const express = require('express');
const router = express.Router();
const { createSajuVisualization } = require('../services/visualizationService');

/**
 * POST /api/v1/saju/visualize
 * body: { userId, userName, style, sajuType, coreElement, luckState, dailyDetail,
 *         analysisSummary, analysisDetails }
 */
router.post('/visualize', async (req, res) => {
  try {
    const {
      userId, userName, style, sajuType,
      coreElement, luckState, dailyDetail,
      analysisSummary, analysisDetails,
    } = req.body;

    if (!userId || !style || !sajuType || !coreElement || !luckState || !dailyDetail) {
      return res.status(400).json({ success: false, error: '필수 파라미터 누락' });
    }

    const { row, prompt } = await createSajuVisualization({
      userId, style, sajuType, coreElement, luckState, dailyDetail,
      analysisSummary, analysisDetails,
    });

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        user_info: { user_id: userId, user_name: userName || null },
        saju_analysis: {
          summary: analysisSummary,
          core_element: coreElement,
          ...analysisDetails,
        },
        visual_metadata: {
          selected_style: style,
          applied_prompt: prompt,
        },
        generated_images: {
          source_image_ref: row.source_image_url,
          cropped_images: {
            U1: row.image_path_u1,
            U2: row.image_path_u2,
            U3: row.image_path_u3,
            U4: row.image_path_u4,
          },
          recommended_default: 'U1',
        },
        expire_at: row.expire_at,
      },
    });
  } catch (err) {
    console.error('[POST /visualize] 오류:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
