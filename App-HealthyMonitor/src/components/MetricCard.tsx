import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface MetricCardProps {
  title: string;
  value: string;
  unit: string;
  color: string;
  backgroundColor: string;
  icon: string;
}

export default function MetricCard({
  title,
  value,
  unit,
  color,
  backgroundColor,
  icon,
}: MetricCardProps) {
  // Lấy màu động từ Theme
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor }]}>
      <Text style={[styles.title, { color }]}>
        {icon} {title}
      </Text>

      <Text style={[styles.value, { color }]}>
        {value}
      </Text>

      <Text style={[styles.unit, { color: colors.textMuted }]}>
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48.5%',
    minHeight: 175,
    borderRadius: 22,
    padding: 18,
    justifyContent: 'center',
    
    // Giữ nguyên màu bóng đổ (shadow) vì shadow màu đen (#000) 
    // kết hợp với opacity thấp là chuẩn cho cả Dark/Light mode
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 12,
  },
  value: {
    fontSize: 52,
    fontWeight: '700',
  },
  unit: {
    fontSize: 14,
    marginTop: -3,
  },
});