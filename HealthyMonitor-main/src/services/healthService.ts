import {
  onValue,
  ref,
} from 'firebase/database';

import {
  database,
} from '../config/firebase';

import {
  HealthData,
} from '../types';

const HEALTH_PATH =
  'health_data';

export function subscribeHealthData(
  onData: (data: HealthData) => void,
  onError?: (error: Error) => void
) {
  const healthRef =
    ref(
      database,
      HEALTH_PATH
    );

  const unsubscribe =
    onValue(
      healthRef,
      snapshot => {
        const data =
          snapshot.val();

        /*
         * Không có dữ liệu
         */
        if (!data) {
          onData({
            bpm: 0,
            spo2: 0,
            status:
              'Chưa có dữ liệu',
            timestamp:
              undefined,
          });

          return;
        }

        /*
         * Đọc BPM
         */
        const bpm =
          Number(data.bpm);

        /*
         * Đọc SpO2
         */
        const spo2 =
          Number(data.spo2);

        /*
         * QUAN TRỌNG:
         *
         * Không sử dụng timestamp
         * do ESP32 gửi lên.
         *
         * Khi app nhận được dữ liệu
         * từ Firebase, lấy thời gian
         * thực tế của điện thoại.
         */
        const receivedAt =
          Date.now();

        onData({
          bpm:
            Number.isFinite(bpm)
              ? bpm
              : 0,

          spo2:
            Number.isFinite(spo2)
              ? spo2
              : 0,

          status:
            String(
              data.status ??
              'Đã kết nối'
            ),

          timestamp:
            receivedAt,
        });
      },

      error => {
        console.error(
          'Firebase health error:',
          error
        );

        onError?.(error);
      }
    );

  return unsubscribe;
}