import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  HealthThresholds,
} from '../types';

const MAX_BPM_KEY =
  'customMaxBpm';

const MIN_SPO2_KEY =
  'customMinSpo2';

export async function loadThresholds(): Promise<
  HealthThresholds | null
> {
  try {
    const savedMaxBpm =
      await AsyncStorage.getItem(
        MAX_BPM_KEY
      );

    const savedMinSpo2 =
      await AsyncStorage.getItem(
        MIN_SPO2_KEY
      );

    if (
      savedMaxBpm === null ||
      savedMinSpo2 === null
    ) {
      return null;
    }

    const maxBpm =
      Number(savedMaxBpm);

    const minSpo2 =
      Number(savedMinSpo2);

    if (
      !Number.isFinite(
        maxBpm
      ) ||
      !Number.isFinite(
        minSpo2
      )
    ) {
      return null;
    }

    return {
      maxBpm,
      minSpo2,
    };
  } catch (error) {
    console.error(
      'Lỗi đọc cài đặt:',
      error
    );

    return null;
  }
}

export async function saveThresholds(
  thresholds: HealthThresholds
): Promise<void> {
  await AsyncStorage.multiSet([
    [
      MAX_BPM_KEY,
      String(
        thresholds.maxBpm
      ),
    ],

    [
      MIN_SPO2_KEY,
      String(
        thresholds.minSpo2
      ),
    ],
  ]);
}

export async function clearThresholds(): Promise<void> {
  await AsyncStorage.multiRemove([
    MAX_BPM_KEY,
    MIN_SPO2_KEY,
  ]);
}
import { UserProfile } from '../types';

const PROFILE_KEY = 'userProfile';
const AUTO_DELETE_KEY = 'autoDeleteDays';

// --- HỒ SƠ NGƯỜI DÙNG ---
export async function loadUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await AsyncStorage.getItem(PROFILE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Lỗi đọc Profile:', error);
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// --- TỰ ĐỘNG XÓA DỮ LIỆU ---
export async function loadAutoDeleteDays(): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(AUTO_DELETE_KEY);
    return data ? Number(data) : 0; // 0 nghĩa là đang tắt
  } catch (error) {
    return 0;
  }
}

export async function saveAutoDeleteDays(days: number): Promise<void> {
  await AsyncStorage.setItem(AUTO_DELETE_KEY, String(days));
}