import {
  get,
  ref,
} from 'firebase/database';

import {
  database,
} from '../config/firebase';

export interface DiagnosticItem {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticResult {
  overall: boolean;
  items: DiagnosticItem[];
}

export async function runDeviceDiagnostic(): Promise<DiagnosticResult> {
  const items: DiagnosticItem[] = [];

  /*
   * KIỂM TRA FIREBASE
   */
  try {
    const connectionSnapshot =
      await get(
        ref(
          database,
          '.info/connected'
        )
      );

    const connected =
      connectionSnapshot.val() ===
      true;

    items.push({
      name: 'Firebase',
      ok: connected,
      detail: connected
        ? 'Đã kết nối Firebase.'
        : 'Không kết nối được Firebase.',
    });
  } catch (error) {
    items.push({
      name: 'Firebase',
      ok: false,
      detail:
        'Không thể kiểm tra kết nối Firebase.',
    });
  }

  /*
   * KIỂM TRA HEALTH DATA
   */
  try {
    const healthSnapshot =
      await get(
        ref(
          database,
          'health_data'
        )
      );

    const data =
      healthSnapshot.val();

    if (!data) {
      items.push({
        name: 'ESP32',
        ok: false,
        detail:
          'Không tìm thấy dữ liệu health_data.',
      });

      items.push({
        name: 'MAX30102',
        ok: false,
        detail:
          'Chưa nhận được dữ liệu BPM/SpO₂.',
      });
    } else {
      const bpm =
        Number(data.bpm);

      const spo2 =
        Number(data.spo2);

      const validBpm =
        Number.isFinite(bpm) &&
        bpm > 0;

      const validSpo2 =
        Number.isFinite(spo2) &&
        spo2 > 0;

      items.push({
        name: 'ESP32',
        ok:
          validBpm &&
          validSpo2,
        detail:
          validBpm &&
          validSpo2
            ? 'ESP32 đang gửi dữ liệu BPM và SpO₂.'
            : 'Dữ liệu ESP32 không hợp lệ.',
      });

      items.push({
        name: 'MAX30102',
        ok:
          validBpm &&
          validSpo2,
        detail:
          validBpm &&
          validSpo2
            ? `Nhận được BPM ${Math.round(
                bpm
              )}, SpO₂ ${spo2.toFixed(
                1
              )}%.`
            : 'Không nhận được giá trị đo hợp lệ.',
      });
    }
  } catch (error) {
    items.push({
      name: 'ESP32',
      ok: false,
      detail:
        'Không thể đọc dữ liệu ESP32.',
    });

    items.push({
      name: 'MAX30102',
      ok: false,
      detail:
        'Không thể kiểm tra dữ liệu cảm biến.',
    });
  }

  /*
   * KIỂM TRA CUỐI
   */
  const overall =
    items.every(
      item => item.ok
    );

  return {
    overall,
    items,
  };
}