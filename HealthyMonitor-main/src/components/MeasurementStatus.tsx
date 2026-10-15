import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  measuring: boolean;
}

export default function MeasurementStatus({ measuring }: Props) {
  // Lấy màu động từ Theme
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text 
        style={[
          styles.title, 
          { color: colors.text } // Áp dụng màu chữ chính
        ]}
      >
        {measuring ? '● Đang đo' : '○ Chờ đo'}
      </Text>

      <Text 
        style={[
          styles.subtitle, 
          { color: colors.textMuted } // Áp dụng màu chữ phụ
        ]}
      >
        {measuring
          ? 'Giữ ngón tay ổn định trên cảm biến'
          : 'Đặt ngón tay lên MAX30102'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
});