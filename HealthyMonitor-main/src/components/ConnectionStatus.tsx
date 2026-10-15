import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useHealthStore } from '../store/useHealthStore';
import { useTheme } from '../theme/ThemeContext';
import { formatTime } from '../utils/format';

type SmartConnectionState = 'connecting' | 'online' | 'unstable' | 'offline';

export default function ConnectionStatus() {
  const { colors } = useTheme();
  
  // 1. Lấy dữ liệu từ Global Store
  const healthData = useHealthStore((state) => state.healthData);
  const firebaseConnected = useHealthStore((state) => state.isConnected);
  
  // 2. Bộ đếm thời gian thực để tính độ trễ dữ liệu
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Tính toán trạng thái kết nối
  const smartState = useMemo<SmartConnectionState>(() => {
    if (!firebaseConnected) {
      return 'offline';
    }

    if (healthData.timestamp) {
      const elapsed = now - healthData.timestamp;
      // Nếu có mạng nhưng ESP32 không gửi data hơn 30 giây -> Không ổn định
      if (elapsed > 30000) {
        return 'unstable';
      }
    } else {
      // Firebase online nhưng chưa có điểm dữ liệu đầu tiên
      return 'connecting';
    }

    return 'online';
  }, [firebaseConnected, healthData.timestamp, now]);

  // 4. Định nghĩa giao diện (Màu sắc và Text) tự động theo Theme
  const ui = useMemo(() => {
    switch (smartState) {
      case 'online':
        return {
          title: 'Đã kết nối',
          description: 'Firebase và cảm biến đang đồng bộ.',
          color: colors.success,
          background: colors.successLight,
          icon: '●',
        };
      case 'unstable':
        return {
          title: 'Kết nối không ổn định',
          description: 'Đã kết nối nhưng dữ liệu lâu chưa cập nhật.',
          color: colors.warning,
          background: colors.warningLight,
          icon: '●',
        };
      case 'offline':
        return {
          title: 'Mất kết nối',
          description: 'Không thể đồng bộ với Firebase.',
          color: colors.danger,
          background: colors.dangerLight,
          icon: '●',
        };
      default:
        return {
          title: 'Đang kết nối',
          description: 'Đang kiểm tra dữ liệu từ ESP32.',
          color: colors.textMuted,
          background: colors.borderLight,
          icon: '●',
        };
    }
  }, [smartState, colors]);

  const lastUpdate = healthData.timestamp ? formatTime(healthData.timestamp) : '--:--:--';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: ui.background,
          borderColor: ui.color + '35',
        },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: ui.color + '20' },
        ]}
      >
        <Text style={[styles.icon, { color: ui.color }]}>{ui.icon}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: ui.color }]}>{ui.title}</Text>
        </View>

        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {ui.description}
        </Text>

        <Text style={[styles.lastUpdate, { color: colors.textMuted }]}>
          Cập nhật gần nhất: {lastUpdate}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    marginBottom: 16,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  icon: {
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  description: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
  },
  lastUpdate: {
    marginTop: 3,
    fontSize: 10,
  },
});