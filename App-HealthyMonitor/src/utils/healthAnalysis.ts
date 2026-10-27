import {
  HealthAnalysis,
  HealthData,
  HealthThresholds,
} from '../types';

import { COLORS } from '../theme/colors';

export function analyzeHealth(
  data: HealthData,
  thresholds: HealthThresholds | null
): HealthAnalysis {
  /**
   * Chưa thiết lập ngưỡng
   */
  if (!thresholds) {
    return {
      level: 'unconfigured',
      title: 'Chưa cấu hình ngưỡng',
      message:
        'Vào Cài đặt để thiết lập ngưỡng BPM và SpO₂.',
      color: COLORS.warning,
    };
  }

  const bpm = Number(data.bpm);
  const spo2 = Number(data.spo2);

  /**
   * Chưa có dữ liệu đo hợp lệ
   */
  if (
    !Number.isFinite(bpm) ||
    !Number.isFinite(spo2) ||
    bpm <= 0 ||
    spo2 <= 0
  ) {
    return {
      level: 'idle',
      title: 'Đang chờ dữ liệu',
      message:
        'Đặt ngón tay đúng vị trí cảm biến để bắt đầu đo.',
      color: COLORS.textMuted,
    };
  }

  /**
   * Vượt ngưỡng nghiêm trọng
   */
  const bpmCritical =
    bpm > thresholds.maxBpm;

  const spo2Critical =
    spo2 < thresholds.minSpo2;

  if (bpmCritical || spo2Critical) {
    let message =
      'Có chỉ số đang vượt ngưỡng đã cấu hình.';

    if (
      bpmCritical &&
      spo2Critical
    ) {
      message =
        `BPM ${bpm.toFixed(
          0
        )} vượt ${thresholds.maxBpm} BPM và SpO₂ ${spo2.toFixed(
          1
        )}% thấp hơn ${thresholds.minSpo2}%.`;
    } else if (bpmCritical) {
      message =
        `BPM ${bpm.toFixed(
          0
        )} vượt ngưỡng ${thresholds.maxBpm} BPM.`;
    } else if (spo2Critical) {
      message =
        `SpO₂ ${spo2.toFixed(
          1
        )}% thấp hơn ngưỡng ${thresholds.minSpo2}%.`;
    }

    return {
      level: 'critical',
      title: 'Vượt ngưỡng',
      message,
      color: COLORS.danger,
    };
  }

  /**
   * Vùng cảnh báo gần ngưỡng
   *
   * Không dùng khoảng quá rộng để tránh trường hợp
   * SpO₂ 99% bị báo cảnh báo khi người dùng đặt
   * ngưỡng tối thiểu là 95%.
   */
  const bpmWarning =
    bpm >
    thresholds.maxBpm - 10;

  const spo2Warning =
    spo2 <
    thresholds.minSpo2 + 2;

  /**
   * BPM quá thấp cũng được đưa vào vùng theo dõi.
   */
  const lowBpmWarning =
    bpm < 60;

  if (
    bpmWarning ||
    spo2Warning ||
    lowBpmWarning
  ) {
    let message =
      'Một chỉ số đang gần ngưỡng theo dõi.';

    if (bpmWarning) {
      message =
        `BPM ${bpm.toFixed(
          0
        )} đang gần ngưỡng tối đa ${thresholds.maxBpm} BPM.`;
    }

    if (spo2Warning) {
      message =
        `SpO₂ ${spo2.toFixed(
          1
        )}% đang gần ngưỡng tối thiểu ${thresholds.minSpo2}%.`;
    }

    if (lowBpmWarning) {
      message =
        `BPM ${bpm.toFixed(
          0
        )} đang ở mức thấp hơn vùng theo dõi thông thường.`;
    }

    return {
      level: 'warning',
      title: 'Cần theo dõi',
      message,
      color: COLORS.warning,
    };
  }

  /**
   * DỮ LIỆU HỢP LỆ + ĐÃ CẤU HÌNH NGƯỠNG
   * + KHÔNG VƯỢT NGƯỠNG
   *
   * => NORMAL
   */
  return {
    level: 'normal',
    title: 'Trong ngưỡng theo dõi',
    message:
      `BPM ${bpm.toFixed(
        0
      )} và SpO₂ ${spo2.toFixed(
        1
      )}% đang trong các ngưỡng đã cấu hình.`,
    color: COLORS.success,
  };
}