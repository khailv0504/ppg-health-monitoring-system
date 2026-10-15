import {
  onValue,
  push,
  ref,
} from 'firebase/database';

import { database } from '../config/firebase';
import { AlertRecord } from '../types';

const ALERT_PATH = 'health_alerts';

/**
 * ==========================================
 * LƯU MỘT CẢNH BÁO VÀO FIREBASE
 * ==========================================
 */
export async function saveHealthAlert(
  alert: Omit<AlertRecord, 'id'>
): Promise<void> {
  try {
    const alertRef = ref(
      database,
      ALERT_PATH
    );

    await push(alertRef, {
      type: alert.type,
      value: alert.value,
      threshold: alert.threshold,
      timestamp: alert.timestamp,
      message: alert.message,
    });
  } catch (error) {
    console.error(
      'Lỗi lưu cảnh báo Firebase:',
      error
    );

    throw error;
  }
}

/**
 * ==========================================
 * THEO DÕI CẢNH BÁO REALTIME
 * ==========================================
 *
 * Hàm này được sử dụng trong:
 * HistoryScreen.tsx
 *
 * Firebase:
 * health_alerts
 *      ↓
 * subscribeAlerts()
 *      ↓
 * HistoryScreen
 */
export function subscribeAlerts(
  onData: (
    data: AlertRecord[]
  ) => void,
  onError?: (
    error: Error
  ) => void
) {
  const alertRef = ref(
    database,
    ALERT_PATH
  );

  const unsubscribe = onValue(
    alertRef,
    snapshot => {
      try {
        const data =
          snapshot.val();

        /**
         * Không có dữ liệu
         */
        if (!data) {
          onData([]);
          return;
        }

        /**
         * Chuyển Firebase object
         * thành mảng AlertRecord[]
         */
        const alerts: AlertRecord[] =
          Object.keys(data)
            .map(key => {
              const item =
                data[key];

              const type: 'bpm' | 'spo2' =
                item?.type === 'spo2'
                  ? 'spo2'
                  : 'bpm';

              return {
                id: key,

                type,

                value: Number(
                  item?.value
                ),

                threshold: Number(
                  item?.threshold
                ),

                timestamp: Number(
                  item?.timestamp
                ),

                message: String(
                  item?.message ?? ''
                ),
              };
            })
            .filter(item => {
              return (
                Number.isFinite(
                  item.value
                ) &&
                Number.isFinite(
                  item.threshold
                ) &&
                Number.isFinite(
                  item.timestamp
                )
              );
            });

        /**
         * Sắp xếp mới nhất lên đầu
         */
        alerts.sort(
          (a, b) =>
            b.timestamp -
            a.timestamp
        );

        onData(alerts);
      } catch (error) {
        console.error(
          'Lỗi xử lý dữ liệu cảnh báo:',
          error
        );

        onError?.(
          error instanceof Error
            ? error
            : new Error(
                'Không thể xử lý dữ liệu cảnh báo'
              )
        );
      }
    },
    error => {
      console.error(
        'Firebase alert error:',
        error
      );

      onError?.(
        error instanceof Error
          ? error
          : new Error(
              'Không thể đọc dữ liệu cảnh báo từ Firebase'
            )
      );
    }
  );
  return unsubscribe;
}