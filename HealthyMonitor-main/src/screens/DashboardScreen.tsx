import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

import { useHealthStore } from '../store/useHealthStore';
import { heartMonitorController } from '../services/HeartMonitorController';
import { useTheme } from '../theme/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

function formatTime(timestamp?: number) {
  if (timestamp === undefined || timestamp === null || !Number.isFinite(timestamp)) return '--:--:--';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDateTime(timestamp?: number) {
  if (timestamp === undefined || timestamp === null || !Number.isFinite(timestamp)) return 'Chưa có dữ liệu';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Chưa có dữ liệu';
  return date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export default function DashboardScreen() {
  const { colors } = useTheme();

  // TỐI ƯU ZUSTAND: Lấy trạng thái từ Global Store thay vì tự quản lý
  const healthData = useHealthStore((state) => state.healthData);
  const thresholds = useHealthStore((state) => state.thresholds);
  const connected = useHealthStore((state) => state.isConnected);

  // Mảng lưu trữ điểm trên biểu đồ
  const [bpmHistory, setBpmHistory] = useState<Array<{ value: number; timestamp: number }>>([]);
  const [spo2History, setSpo2History] = useState<Array<{ value: number; timestamp: number }>>([]);

  // Cập nhật biểu đồ mỗi khi healthData thay đổi
  useEffect(() => {
    if (healthData.bpm > 0 && healthData.timestamp) {
      setBpmHistory(prev => [...prev.slice(-19), { value: healthData.bpm, timestamp: healthData.timestamp! }]);
    }
    if (healthData.spo2 > 0 && healthData.timestamp) {
      setSpo2History(prev => [...prev.slice(-19), { value: healthData.spo2, timestamp: healthData.timestamp! }]);
    }
  }, [healthData]);

  const analysis = useMemo(() => {
    if (!thresholds) return { title: 'Chưa cấu hình ngưỡng', message: 'Vào Settings để thiết lập.', level: 'unconfigured' };
    if (healthData.bpm <= 0 || healthData.spo2 <= 0) return { title: 'Đang chờ dữ liệu', message: 'Đặt ngón tay lên cảm biến.', level: 'idle' };
    
    if (healthData.bpm > thresholds.maxBpm || healthData.spo2 < thresholds.minSpo2) {
      return { title: 'Chỉ số đang vượt ngưỡng', message: 'Chỉ số đang vượt ngưỡng.', level: 'critical' };
    }
    if (healthData.bpm > thresholds.maxBpm - 10 || healthData.spo2 < thresholds.minSpo2 + 2 || healthData.bpm < 60) {
      return { title: 'Cần theo dõi', message: 'Chỉ số đang ở vùng cần theo dõi.', level: 'warning' };
    }
    return { title: 'Các chỉ số bình thường', message: 'Các chỉ số bình thường.', level: 'normal' };
  }, [healthData.bpm, healthData.spo2, thresholds]);

  const analysisColor =
    analysis.level === 'critical' ? colors.danger
    : analysis.level === 'warning' ? colors.warning
    : analysis.level === 'normal' ? colors.success
    : colors.textMuted;

  const chartWidth = SCREEN_WIDTH - 72;

  const safeBpmData = bpmHistory.length >= 2 ? bpmHistory : 
    (healthData.bpm > 0 && healthData.timestamp 
      ? [{ value: healthData.bpm, timestamp: healthData.timestamp }, { value: healthData.bpm, timestamp: healthData.timestamp }] 
      : [{ value: 0, timestamp: Date.now() }, { value: 0, timestamp: Date.now() }]);

  const safeSpo2Data = spo2History.length >= 2 ? spo2History : 
    (healthData.spo2 > 0 && healthData.timestamp 
      ? [{ value: healthData.spo2, timestamp: healthData.timestamp }, { value: healthData.spo2, timestamp: healthData.timestamp }] 
      : [{ value: 0, timestamp: Date.now() }, { value: 0, timestamp: Date.now() }]);

  const chartLabels = (points: Array<{ timestamp: number }>) => {
    const result = points.map(() => '');
    if (points.length <= 4) {
      points.forEach((point, index) => { result[index] = formatTime(point.timestamp).slice(0, 5); });
      return result;
    }
    const indexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    indexes.forEach(index => { result[index] = formatTime(points[index].timestamp).slice(0, 5); });
    return result;
  };

  const connectionText = connected ? 'Đã kết nối Firebase' : 'Mất kết nối Firebase';
  const connectionColor = connected ? colors.success : colors.danger;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.title, { color: colors.text }]}>Health Monitor</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Theo dõi BPM & SpO₂</Text>
            </View>
            <View style={[styles.connectionBadge, { backgroundColor: connected ? colors.successLight : colors.dangerLight }]}>
              <View style={[styles.connectionDot, { backgroundColor: connectionColor }]} />
              <Text style={[styles.connectionText, { color: connectionColor }]}>{connected ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
          </View>

          {/* TRẠNG THÁI */}
          <View style={styles.measureStatus}>
            <View style={[styles.statusDot, { backgroundColor: analysisColor }]} />
            <Text style={[styles.statusTitle, { color: colors.text }]}>{connected ? 'Đang đo' : 'Đang kết nối'}</Text>
          </View>
          <Text style={[styles.statusDescription, { color: colors.textMuted }]}>{analysis.message}</Text>

          {/* PHÂN TÍCH */}
          <View style={[styles.analysisCard, { backgroundColor: colors.card, borderLeftColor: analysisColor }]}>
            <Text style={[styles.analysisTitle, { color: analysisColor }]}>{analysis.title}</Text>
            <Text style={[styles.analysisMessage, { color: colors.textSecondary }]}>{analysis.message}</Text>
          </View>

          {/* BPM / SPO2 */}
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.text }]}>♥ NHỊP TIM</Text>
              <Text style={[styles.metricValue, { color: colors.bpm }]}>{healthData.bpm > 0 ? Math.round(healthData.bpm) : '--'}</Text>
              <Text style={[styles.metricUnit, { color: colors.textMuted }]}>BPM</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.text }]}>◉ BLOOD OXYGEN</Text>
              <Text style={[styles.metricValue, { color: colors.spo2 }]}>{healthData.spo2 > 0 ? healthData.spo2.toFixed(1) : '--'}</Text>
              <Text style={[styles.metricUnit, { color: colors.textMuted }]}>%</Text>
            </View>
          </View>

          {/* BIỂU ĐỒ BPM */}
          <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Nhịp tim</Text>
                <Text style={[styles.chartSubtitle, { color: colors.textMuted }]}>Dữ liệu realtime</Text>
              </View>
              <View>
                <Text style={[styles.chartValue, { color: colors.bpm }]}>{healthData.bpm > 0 ? Math.round(healthData.bpm) : '--'}</Text>
                <Text style={[styles.chartUnit, { color: colors.textMuted }]}>BPM</Text>
              </View>
            </View>
            <LineChart
              data={{ labels: chartLabels(safeBpmData), datasets: [{ data: safeBpmData.map(item => item.value), color: () => colors.bpm, strokeWidth: 3 }] }}
              width={chartWidth} height={225}
              chartConfig={{ backgroundColor: colors.card, backgroundGradientFrom: colors.card, backgroundGradientTo: colors.card, decimalPlaces: 0, color: (opacity = 1) => `rgba(224,95,109,${opacity})`, labelColor: (opacity = 1) => isDarkSafeColor(colors.textSecondary, opacity), propsForDots: { r: '4', strokeWidth: '2' }, propsForBackgroundLines: { stroke: colors.chartGrid } }}
              bezier fromZero={false} withDots withInnerLines withOuterLines={false} withVerticalLines={false} withHorizontalLines horizontalLabelRotation={0} verticalLabelRotation={0} style={styles.chart}
            />
          </View>

          {/* BIỂU ĐỒ SPO2 */}
          <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Nồng độ SpO₂</Text>
                <Text style={[styles.chartSubtitle, { color: colors.textMuted }]}>Dữ liệu realtime</Text>
              </View>
              <View>
                <Text style={[styles.chartValue, { color: colors.spo2 }]}>{healthData.spo2 > 0 ? healthData.spo2.toFixed(1) : '--'}</Text>
                <Text style={[styles.chartUnit, { color: colors.textMuted }]}>%</Text>
              </View>
            </View>
            <LineChart
              data={{ labels: chartLabels(safeSpo2Data), datasets: [{ data: safeSpo2Data.map(item => item.value), color: () => colors.spo2, strokeWidth: 3 }] }}
              width={chartWidth} height={225}
              chartConfig={{ backgroundColor: colors.card, backgroundGradientFrom: colors.card, backgroundGradientTo: colors.card, decimalPlaces: 1, color: (opacity = 1) => `rgba(22,139,139,${opacity})`, labelColor: (opacity = 1) => isDarkSafeColor(colors.textSecondary, opacity), propsForDots: { r: '4', strokeWidth: '2' }, propsForBackgroundLines: { stroke: colors.chartGrid } }}
              bezier fromZero={false} withDots withInnerLines withOuterLines={false} withVerticalLines={false} withHorizontalLines horizontalLabelRotation={0} verticalLabelRotation={0} style={styles.chart}
            />
          </View>

          {/* INFO CARDS */}
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Trạng thái kết nối</Text>
            <Text style={[styles.infoValue, { color: connectionColor }]}>{connectionText}</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>{healthData.status}</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Cập nhật gần nhất</Text>
            <Text style={[styles.updateTime, { color: colors.primary }]}>{formatTime(healthData.timestamp)}</Text>
            <Text style={[styles.infoText, { color: colors.textMuted }]}>{formatDateTime(healthData.timestamp)}</Text>
          </View>
          
          <TouchableOpacity style={[styles.refreshButton, { backgroundColor: colors.primary }]} activeOpacity={0.8} onPress={() => {
            heartMonitorController.reloadThresholds();
            Alert.alert('Health Monitor', 'Đã cập nhật cấu hình ngưỡng vào hệ thống.');
          }}>
            <Text style={styles.refreshButtonText}>Cập nhật cấu hình</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function isDarkSafeColor(hex: string, opacity: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(100,116,139,${opacity})`;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerText: { flex: 1, paddingRight: 10 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 18, marginTop: 2 },
  connectionDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  connectionText: { fontSize: 10, fontWeight: '800' },
  measureStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  statusTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  statusDescription: { fontSize: 12, lineHeight: 17, marginTop: 3, marginBottom: 14 },
  analysisCard: { borderRadius: 18, borderLeftWidth: 5, padding: 15, marginBottom: 20, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  analysisTitle: { fontSize: 16, lineHeight: 20, fontWeight: '800', marginBottom: 4 },
  analysisMessage: { fontSize: 12, lineHeight: 18 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metric: { width: '48%' },
  metricLabel: { fontSize: 12, lineHeight: 17, fontWeight: '800', marginBottom: 3 },
  metricValue: { fontSize: 46, lineHeight: 51, fontWeight: '800' },
  metricUnit: { fontSize: 13, lineHeight: 17 },
  chartCard: { borderRadius: 22, paddingTop: 17, paddingBottom: 7, marginBottom: 15, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, alignItems: 'flex-start' },
  chartTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800' },
  chartSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 1 },
  chartValue: { fontSize: 23, lineHeight: 27, fontWeight: '800', textAlign: 'right' },
  chartUnit: { textAlign: 'right', fontSize: 11, lineHeight: 15 },
  chart: { marginTop: 2, marginLeft: -8, borderRadius: 18 },
  infoCard: { borderRadius: 19, padding: 16, marginBottom: 13, shadowOpacity: 0.04, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  infoTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', marginBottom: 5 },
  infoValue: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  infoText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  updateTime: { fontSize: 18, lineHeight: 23, fontWeight: '800' },
  refreshButton: { height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  refreshButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '800' },
});