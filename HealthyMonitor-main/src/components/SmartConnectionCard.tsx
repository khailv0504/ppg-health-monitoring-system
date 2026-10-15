import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Lấy dữ liệu từ Global Store thay vì tự gọi Firebase
import { useHealthStore } from '../store/useHealthStore';
import { useTheme } from '../theme/ThemeContext';

function formatAge(ageMs?: number): string {
  if (ageMs === undefined) {
    return '--';
  }
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} phút`;
}

export default function SmartConnectionCard() {
  const { colors } = useTheme();

  // Đọc dữ liệu realtime từ Zustand
  const healthData = useHealthStore((state) => state.healthData);
  const firebaseConnected = useHealthStore((state) => state.isConnected);

  // Biến đếm thời gian trễ (Data Delay) dùng riêng cho UI
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tính toán trạng thái dựa trên dữ liệu tổng
  const hasHealthData = healthData.bpm > 0 && healthData.spo2 > 0;
  const ageMs = healthData.timestamp ? now - healthData.timestamp : undefined;

  let state = 'waiting';
  if (!firebaseConnected) {
    state = 'offline';
  } else if (!hasHealthData) {
    state = 'waiting';
  } else if (ageMs !== undefined && ageMs > 30000) {
    // Trễ hơn 30 giây -> Mạng chập chờn / ESP32 mất điện
    state = 'delayed';
  } else {
    state = 'online';
  }

  // Khai báo giao diện (Màu sắc và Text)
  let title = '';
  let description = '';
  let color = colors.textMuted;

  if (state === 'online') {
    title = 'ONLINE';
    description = 'Firebase và dữ liệu cảm biến đang hoạt động.';
    color = colors.success;
  } else if (state === 'delayed') {
    title = 'DATA DELAY';
    description = `Dữ liệu chưa cập nhật trong ${formatAge(ageMs)}.`;
    color = colors.warning;
  } else if (state === 'offline') {
    title = 'OFFLINE';
    description = 'Không thể kết nối Firebase.';
    color = colors.danger;
  } else {
    title = 'WAITING';
    description = 'Đang chờ dữ liệu ESP32.';
    color = colors.textMuted;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.title, { color }]}>{title}</Text>
      </View>

      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {description}
      </Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Firebase</Text>
        <Text style={[styles.value, { color: firebaseConnected ? colors.success : colors.danger }]}>
          {firebaseConnected ? 'Kết nối' : 'Mất kết nối'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Dữ liệu cảm biến</Text>
        <Text style={[styles.value, { color: hasHealthData ? colors.success : colors.warning }]}>
          {hasHealthData ? 'Có dữ liệu' : 'Chờ dữ liệu'}
        </Text>
      </View>

      {healthData.timestamp ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Cập nhật</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {formatAge(ageMs)} trước
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 17, marginBottom: 16, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 7 },
  title: { fontSize: 17, fontWeight: '800' },
  description: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 12 },
  value: { fontSize: 12, fontWeight: '700' },
});