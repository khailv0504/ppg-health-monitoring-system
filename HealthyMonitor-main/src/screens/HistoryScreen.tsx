import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { subscribeHistory } from '../services/historyService';
import { HistoryRecord } from '../types';
import { useTheme } from '../theme/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

type RangeMode = 'today' | '7days' | '30days';

const RANGE_OPTIONS: Array<{ key: RangeMode; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7days', label: '7 ngày' },
  { key: '30days', label: '30 ngày' },
];

function normalizeTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 10000000000) return value * 1000;
  return value;
}

function formatChartTime(timestamp: number): string {
  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return '';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatRecordDateTime(timestamp: number): string {
  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return '--';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function getStartOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getStartTimestamp(range: RangeMode): number {
  const today = getStartOfToday();
  if (range === 'today') return today;
  const date = new Date(today);
  if (range === '7days') {
    date.setDate(date.getDate() - 6);
  } else {
    date.setDate(date.getDate() - 29);
  }
  return date.getTime();
}

function buildChartLabels(records: HistoryRecord[]): string[] {
  const labels = records.map(() => '');
  if (records.length === 0) return labels;

  const maxLabels = 4;
  if (records.length <= maxLabels) {
    records.forEach((record, index) => {
      labels[index] = formatChartTime(record.timestamp);
    });
    return labels;
  }

  const indexes = Array.from(
    { length: maxLabels },
    (_, index) => Math.round((index * (records.length - 1)) / (maxLabels - 1))
  );

  indexes.forEach((index) => {
    labels[index] = formatChartTime(records[index].timestamp);
  });

  return labels;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function HistoryScreen() {
  const { colors } = useTheme();

  const [range, setRange] = useState<RangeMode>('today');
  const [allHistory, setAllHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedBpmPoint, setSelectedBpmPoint] = useState<HistoryRecord | null>(null);
  const [selectedSpo2Point, setSelectedSpo2Point] = useState<HistoryRecord | null>(null);

  // TỐI ƯU FIREBASE: Gọi lại data mỗi khi range thay đổi
  const loadHistory = useCallback(() => {
    setLoading(true);
    const start = getStartTimestamp(range);

    const unsubscribe = subscribeHistory(
      start, // Truyền mốc thời gian xuống Firebase Query
      (data) => {
        setAllHistory(data);
        setLoading(false);
        setErrorMessage('');
      },
      (error) => {
        console.error('History Firebase error:', error);
        setLoading(false);
        setErrorMessage('Không thể đồng bộ lịch sử từ Firebase.');
      }
    );

    return unsubscribe;
  }, [range]); // Dependency là range để tự fetch lại khi user đổi tab bộ lọc

  useEffect(() => {
    return loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setSelectedBpmPoint(null);
    setSelectedSpo2Point(null);
  }, [range]);

  const filteredHistory = useMemo(() => {
    const start = getStartTimestamp(range);
    const now = Date.now();
    return allHistory
      .map((item) => ({
        ...item,
        timestamp: normalizeTimestamp(item.timestamp),
      }))
      .filter((item) => item.timestamp >= start && item.timestamp <= now && item.bpm > 0 && item.spo2 > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [allHistory, range]);

  const stats = useMemo(() => {
    if (filteredHistory.length === 0) {
      return { avgBpm: 0, minBpm: 0, maxBpm: 0, avgSpo2: 0, minSpo2: 0, maxSpo2: 0 };
    }
    const bpms = filteredHistory.map((item) => item.bpm);
    const spo2s = filteredHistory.map((item) => item.spo2);
    const sumBpm = bpms.reduce((sum, value) => sum + value, 0);
    const sumSpo2 = spo2s.reduce((sum, value) => sum + value, 0);

    return {
      avgBpm: sumBpm / bpms.length,
      minBpm: Math.min(...bpms),
      maxBpm: Math.max(...bpms),
      avgSpo2: sumSpo2 / spo2s.length,
      minSpo2: Math.min(...spo2s),
      maxSpo2: Math.max(...spo2s),
    };
  }, [filteredHistory]);

  const chartWidth = SCREEN_WIDTH - 72;

  const bpmChartData = filteredHistory.length >= 2
    ? filteredHistory
    : filteredHistory.length === 1
    ? [filteredHistory[0], filteredHistory[0]]
    : [{ id: 'empty-bpm-1', bpm: 0, spo2: 0, timestamp: Date.now() }, { id: 'empty-bpm-2', bpm: 0, spo2: 0, timestamp: Date.now() }];

  const spo2ChartData = filteredHistory.length >= 2
    ? filteredHistory
    : filteredHistory.length === 1
    ? [filteredHistory[0], filteredHistory[0]]
    : [{ id: 'empty-spo2-1', bpm: 0, spo2: 0, timestamp: Date.now() }, { id: 'empty-spo2-2', bpm: 0, spo2: 0, timestamp: Date.now() }];

  const handleBpmPointClick = (point: any) => {
    if (!Number.isFinite(point?.index)) return;
    const index = Number(point.index);
    if (index < 0 || index >= filteredHistory.length) return;
    setSelectedBpmPoint(filteredHistory[index]);
    setSelectedSpo2Point(null);
  };

  const handleSpo2PointClick = (point: any) => {
    if (!Number.isFinite(point?.index)) return;
    const index = Number(point.index);
    if (index < 0 || index >= filteredHistory.length) return;
    setSelectedSpo2Point(filteredHistory[index]);
    setSelectedBpmPoint(null);
  };

  const exportPdf = async () => {
    if (filteredHistory.length === 0) {
      Alert.alert('Trống', 'Không có dữ liệu trong khoảng thời gian đang chọn.');
      return;
    }

    try {
      const rangeTitle = range === 'today' ? 'Hôm nay' : range === '7days' ? '7 ngày gần nhất' : '30 ngày gần nhất';
      const detailRows = filteredHistory
        .map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(formatRecordDateTime(item.timestamp))}</td>
            <td class="bpm">${Math.round(item.bpm)}</td>
            <td class="spo2">${item.spo2.toFixed(1)}</td>
          </tr>
        `).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              @page { size: A4; margin: 24px; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #172033; margin: 0; }
              h1 { font-size: 26px; margin: 0 0 6px 0; }
              .subtitle { font-size: 14px; color: #667085; margin-bottom: 22px; }
              .summary { display: table; width: 100%; border-spacing: 8px; margin-left: -8px; margin-right: -8px; }
              .box { display: table-cell; width: 16.66%; border: 1px solid #e2e8f0; border-radius: 10px; padding: 11px; vertical-align: top; }
              .label { font-size: 11px; color: #667085; margin-bottom: 5px; }
              .value { font-size: 19px; font-weight: 700; }
              .bpm { color: #e05f6d; }
              .spo2 { color: #168b8b; }
              h2 { font-size: 18px; margin-top: 24px; margin-bottom: 10px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th { background: #f1f5f9; text-align: left; padding: 8px; border: 1px solid #e2e8f0; }
              td { padding: 8px; border: 1px solid #e2e8f0; }
              .footer { margin-top: 18px; font-size: 10px; color: #98a2b3; }
            </style>
          </head>
          <body>
            <h1>HEALTH MONITOR</h1>
            <div class="subtitle">Báo cáo nhịp tim (BPM) và nồng độ oxy SpO₂ — ${escapeHtml(rangeTitle)}</div>
            <div class="summary">
              <div class="box"><div class="label">BPM trung bình</div><div class="value bpm">${stats.avgBpm.toFixed(1)}</div></div>
              <div class="box"><div class="label">BPM thấp nhất</div><div class="value bpm">${Math.round(stats.minBpm)}</div></div>
              <div class="box"><div class="label">BPM cao nhất</div><div class="value bpm">${Math.round(stats.maxBpm)}</div></div>
              <div class="box"><div class="label">SpO₂ trung bình</div><div class="value spo2">${stats.avgSpo2.toFixed(1)}%</div></div>
              <div class="box"><div class="label">SpO₂ thấp nhất</div><div class="value spo2">${stats.minSpo2.toFixed(1)}%</div></div>
              <div class="box"><div class="label">SpO₂ cao nhất</div><div class="value spo2">${stats.maxSpo2.toFixed(1)}%</div></div>
            </div>
            <h2>Chi tiết các lần ghi nhận</h2>
            <table>
              <thead><tr><th>#</th><th>Thời gian</th><th>BPM</th><th>SpO₂ (%)</th></tr></thead>
              <tbody>${detailRows}</tbody>
            </table>
            <div class="footer">Số bản ghi: ${filteredHistory.length}</div>
          </body>
        </html>
      `;

      const result = await Print.printToFileAsync({ html });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Chia sẻ báo cáo PDF' });
      } else {
        Alert.alert('Thông báo', 'Thiết bị không hỗ trợ chia sẻ file.');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Lỗi', 'Không thể tạo báo cáo PDF.');
    }
  };

  const chartConfig = {
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(224,95,109,${opacity})`,
    labelColor: (opacity = 1) => isDarkSafeColor(colors.textSecondary, opacity),
    propsForDots: { r: '4', strokeWidth: '2' },
    propsForBackgroundLines: { stroke: colors.chartGrid },
  };

  const bpmLabels = buildChartLabels(bpmChartData);
  const spo2Labels = buildChartLabels(spo2ChartData);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              Lịch sử
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Theo dõi các lần ghi nhận BPM và SpO₂
            </Text>
          </View>
          <TouchableOpacity style={[styles.exportButton, { backgroundColor: colors.primary }]} activeOpacity={0.8} onPress={exportPdf}>
            <Text style={styles.exportButtonText}>Xuất PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rangeContainer}>
          {RANGE_OPTIONS.map((option) => {
            const active = range === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                activeOpacity={0.8}
                style={[
                  styles.rangeButton,
                  { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
                ]}
                onPress={() => setRange(option.key)}
              >
                <Text style={[styles.rangeButtonText, { color: active ? '#FFFFFF' : colors.text }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.statsRow}>
          <StatCard title="BPM TB" value={stats.avgBpm ? stats.avgBpm.toFixed(1) : '--'} color={colors.bpm} colors={colors} />
          <StatCard title="BPM Min" value={stats.minBpm || '--'} color={colors.bpm} colors={colors} />
          <StatCard title="BPM Max" value={stats.maxBpm || '--'} color={colors.bpm} colors={colors} />
        </View>

        <View style={styles.statsRow}>
          <StatCard title="SpO₂ TB" value={stats.avgSpo2 ? `${stats.avgSpo2.toFixed(1)}%` : '--'} color={colors.spo2} colors={colors} />
          <StatCard title="SpO₂ Min" value={stats.minSpo2 ? `${stats.minSpo2.toFixed(1)}%` : '--'} color={colors.spo2} colors={colors} />
          <StatCard title="SpO₂ Max" value={stats.maxSpo2 ? `${stats.maxSpo2.toFixed(1)}%` : '--'} color={colors.spo2} colors={colors} />
        </View>

        {errorMessage ? (
          <View style={[styles.errorCard, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>Biểu đồ BPM</Text>
          <Text style={[styles.chartSubtitle, { color: colors.textMuted }]}>Chạm vào điểm để xem chi tiết</Text>
          <LineChart
            data={{
              labels: bpmLabels,
              datasets: [{ data: bpmChartData.map((item) => item.bpm), color: () => colors.bpm, strokeWidth: 3 }],
            }}
            width={chartWidth} height={270}
            chartConfig={{ ...chartConfig, decimalPlaces: 0, color: (opacity = 1) => `rgba(224,95,109,${opacity})` }}
            bezier fromZero={false} withDots withInnerLines withOuterLines={false} withVerticalLines={false} withHorizontalLines
            horizontalLabelRotation={0} verticalLabelRotation={0} onDataPointClick={handleBpmPointClick} style={styles.chart}
          />
          {selectedBpmPoint ? (
            <PointDetail
              title="Điểm BPM đã chọn" record={selectedBpmPoint} valueLabel="BPM"
              value={`${Math.round(selectedBpmPoint.bpm)} BPM`} valueColor={colors.bpm} colors={colors}
            />
          ) : null}
        </View>

        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>Biểu đồ SpO₂</Text>
          <Text style={[styles.chartSubtitle, { color: colors.textMuted }]}>Chạm vào điểm để xem chi tiết</Text>
          <LineChart
            data={{
              labels: spo2Labels,
              datasets: [{ data: spo2ChartData.map((item) => item.spo2), color: () => colors.spo2, strokeWidth: 3 }],
            }}
            width={chartWidth} height={270}
            chartConfig={{ ...chartConfig, decimalPlaces: 1, color: (opacity = 1) => `rgba(22,139,139,${opacity})` }}
            bezier fromZero={false} withDots withInnerLines withOuterLines={false} withVerticalLines={false} withHorizontalLines
            horizontalLabelRotation={0} verticalLabelRotation={0} onDataPointClick={handleSpo2PointClick} style={styles.chart}
          />
          {selectedSpo2Point ? (
            <PointDetail
              title="Điểm SpO₂ đã chọn" record={selectedSpo2Point} valueLabel="SpO₂"
              value={`${selectedSpo2Point.spo2.toFixed(1)}%`} valueColor={colors.spo2} colors={colors}
            />
          ) : null}
        </View>

        <View style={[styles.recentCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Nhật ký gần đây</Text>
          {loading ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Đang đồng bộ dữ liệu...</Text>
          ) : filteredHistory.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Chưa có dữ liệu trong khoảng thời gian này.</Text>
          ) : (
            filteredHistory.slice(-12).reverse().map((item) => (
              <View key={item.id} style={[styles.recordRow, { borderBottomColor: colors.borderLight }]}>
                <View style={styles.recordLeft}>
                  <Text style={[styles.recordTime, { color: colors.text }]}>{formatRecordDateTime(item.timestamp)}</Text>
                  <Text style={[styles.recordSubtext, { color: colors.textMuted }]}>
                    {item.bpm > 100 ? 'Nhịp tim cao' : item.bpm < 60 ? 'Nhịp tim thấp' : 'Trong khoảng theo dõi'}
                  </Text>
                </View>
                <View style={styles.recordRight}>
                  <Text style={[styles.recordBpm, { color: colors.bpm }]}>
                    {Math.round(item.bpm)} <Text style={[styles.recordUnit, { color: colors.textMuted }]}>BPM</Text>
                  </Text>
                  <Text style={[styles.recordSpo2, { color: colors.spo2 }]}>SpO₂ {item.spo2.toFixed(1)}%</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PointDetail({ title, record, valueLabel, value, valueColor, colors }: { title: string; record: HistoryRecord; valueLabel: string; value: string; valueColor: string; colors: any; }) {
  return (
    <View style={[styles.pointDetail, { backgroundColor: colors.cardSecondary, borderColor: colors.borderLight }]}>
      <View style={styles.pointDetailHeader}>
        <Text style={[styles.pointDetailTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.pointDetailValue, { color: valueColor }]}>{value}</Text>
      </View>
      <Text style={[styles.pointDetailTime, { color: colors.textSecondary }]}>{formatRecordDateTime(record.timestamp)}</Text>
      <View style={styles.pointDetailRow}>
        <Text style={[styles.pointDetailLabel, { color: colors.textMuted }]}>BPM</Text>
        <Text style={[styles.pointDetailNumber, { color: colors.bpm }]}>{Math.round(record.bpm)}</Text>
        <Text style={[styles.pointDetailLabel, { color: colors.textMuted }]}>SpO₂</Text>
        <Text style={[styles.pointDetailNumber, { color: colors.spo2 }]}>{record.spo2.toFixed(1)}%</Text>
      </View>
    </View>
  );
}

function StatCard({ title, value, color, colors }: { title: string; value: string | number; color: string; colors: any; }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.statTitle, { color: colors.textMuted }]}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17 },
  headerText: { flex: 1, paddingRight: 10 },
  headerTitle: { fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  exportButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, marginTop: 3 },
  exportButtonText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '800' },
  rangeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 17 },
  rangeButton: { width: '31.5%', minHeight: 50, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  rangeButtonText: { fontSize: 14, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  statCard: { width: '31.5%', minHeight: 98, borderRadius: 18, padding: 13, justifyContent: 'center', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  statTitle: { fontSize: 12, lineHeight: 16, fontWeight: '700', marginBottom: 7 },
  statValue: { fontSize: 26, lineHeight: 31, fontWeight: '800' },
  errorCard: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14 },
  errorText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  chartCard: { borderRadius: 22, paddingTop: 18, paddingBottom: 10, marginBottom: 16, shadowOpacity: 0.04, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chartTitle: { paddingHorizontal: 18, fontSize: 22, lineHeight: 27, fontWeight: '800' },
  chartSubtitle: { paddingHorizontal: 18, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chart: { marginTop: 5, marginLeft: -8, borderRadius: 18 },
  pointDetail: { marginHorizontal: 16, marginTop: 4, padding: 12, borderRadius: 14, borderWidth: 1 },
  pointDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pointDetailTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  pointDetailValue: { fontSize: 18, lineHeight: 22, fontWeight: '800' },
  pointDetailTime: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  pointDetailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  pointDetailLabel: { fontSize: 11, marginRight: 4 },
  pointDetailNumber: { fontSize: 13, fontWeight: '800', marginRight: 14 },
  recentCard: { borderRadius: 22, padding: 18, marginBottom: 18, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1 },
  recordLeft: { flex: 1, paddingRight: 10 },
  recordRight: { alignItems: 'flex-end' },
  recordTime: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  recordSubtext: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  recordBpm: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  recordUnit: { fontSize: 10, fontWeight: '600' },
  recordSpo2: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});