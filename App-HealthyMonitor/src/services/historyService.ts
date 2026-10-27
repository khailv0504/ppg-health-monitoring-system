import { get, endAt, update, remove } from 'firebase/database'; 
import {
  onValue,
  push,
  ref,
  query,
  orderByChild,
  startAt,
} from 'firebase/database';

import { database } from '../config/firebase';
import { HistoryRecord } from '../types';

const HISTORY_PATH = 'health_history';

export async function saveHealthHistory(
  bpm: number,
  spo2: number
): Promise<void> {
  if (
    !Number.isFinite(bpm) ||
    !Number.isFinite(spo2) ||
    bpm <= 0 ||
    spo2 <= 0
  ) {
    return;
  }

  const historyRef = ref(database, HISTORY_PATH);

  await push(historyRef, {
    bpm: Number(bpm.toFixed(0)),
    spo2: Number(spo2.toFixed(1)),
    timestamp: Date.now(),
  });
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0;
  }

  if (timestamp < 10000000000) {
    return timestamp * 1000;
  }

  return timestamp;
}

export function subscribeHistory(
  startTimestamp: number, // Bắt buộc nhận mốc thời gian để lọc
  onData: (data: HistoryRecord[]) => void,
  onError?: (error: Error) => void
) {
  const historyRef = ref(database, HISTORY_PATH);

  // TỐI ƯU FIREBASE: Lọc dữ liệu ngay từ server bằng startAt
  const historyQuery = query(
    historyRef,
    orderByChild('timestamp'),
    startAt(startTimestamp)
  );

  const unsubscribe = onValue(
    historyQuery,
    (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        onData([]);
        return;
      }

      const parsedData: HistoryRecord[] = Object.keys(data)
        .map((key) => ({
          id: key,
          bpm: Number(data[key]?.bpm),
          spo2: Number(data[key]?.spo2),
          timestamp: normalizeTimestamp(data[key]?.timestamp),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.bpm) &&
            Number.isFinite(item.spo2) &&
            item.timestamp > 0 &&
            item.bpm > 0 &&
            item.spo2 > 0
        );

      // Sắp xếp: Mới nhất nằm trên cùng
      parsedData.sort((a, b) => b.timestamp - a.timestamp);

      onData(parsedData);
    },
    (error) => {
      console.error('History Firebase error:', error);
      onError?.(error);
    }
  );

  return unsubscribe;
}
export async function clearAllHistory(): Promise<void> {
  const historyRef = ref(database, HISTORY_PATH);
  await remove(historyRef);
}

export async function deleteOldHistory(daysToKeep: number): Promise<void> {
  if (daysToKeep <= 0) return;
  
  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  const historyRef = ref(database, HISTORY_PATH);
  const q = query(historyRef, orderByChild('timestamp'), endAt(cutoffTime));
  
  const snapshot = await get(q);
  if (snapshot.exists()) {
    const updates: Record<string, null> = {};
    snapshot.forEach((child) => {
      updates[child.key!] = null; // Mark for deletion
    });
    // Xóa hàng loạt bằng hàm update (nhanh hơn remove từng cái)
    await update(historyRef, updates);
  }
}