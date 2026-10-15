import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Switch, Text,
  TextInput, TouchableOpacity, View, ActivityIndicator
} from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { useHealthStore } from '../store/useHealthStore';
import { heartMonitorController } from '../services/HeartMonitorController';
import { 
  loadThresholds, saveThresholds, clearThresholds,
  saveUserProfile, saveAutoDeleteDays 
} from '../services/settingsService';
import { clearAllHistory, deleteOldHistory } from '../services/historyService';

// IMPORT HÀM ĐĂNG XUẤT TỪ AUTH SERVICE
import { logoutUser } from '../services/authService';

export default function SettingsScreen() {
  const { colors, isDark, setMode } = useTheme();

  // Global State
  const globalProfile = useHealthStore(state => state.userProfile);
  const globalAutoDelete = useHealthStore(state => state.autoDeleteDays);

  // Local State: Ngưỡng theo dõi
  const [maxBpm, setMaxBpm] = useState('');
  const [minSpo2, setMinSpo2] = useState('');

  // Local State: Hồ sơ
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Local State: Dọn dẹp
  const [isAutoDelete, setIsAutoDelete] = useState(false);
  const [processingData, setProcessingData] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await loadThresholds();
    if (data) {
      setMaxBpm(String(data.maxBpm));
      setMinSpo2(String(data.minSpo2));
    }
    if (globalProfile) {
      setName(globalProfile.name);
      setAge(globalProfile.age);
      setHeight(globalProfile.height);
      setWeight(globalProfile.weight);
      setEmergencyPhone(globalProfile.emergencyPhone || '');
    }
    setIsAutoDelete(globalAutoDelete > 0);
  };

  // --- LƯU CẤU HÌNH NGƯỠNG ---
  const handleSaveThresholds = async () => {
    const bpm = Number(maxBpm);
    const spo2 = Number(minSpo2);
    if (!Number.isFinite(bpm) || !Number.isFinite(spo2) || bpm <= 0 || spo2 <= 0) {
      Alert.alert('Lỗi', 'Vui lòng nhập ngưỡng hợp lệ (>0).');
      return;
    }
    await saveThresholds({ maxBpm: bpm, minSpo2: spo2 });
    await heartMonitorController.reloadThresholds();
    Alert.alert('Thành công', 'Ngưỡng đã được cập nhật.');
  };

  // --- LƯU HỒ SƠ NGƯỜI DÙNG ---
  const handleSaveProfile = async () => {
    const profile = { name, age, height, weight, emergencyPhone };
    await saveUserProfile(profile);
    useHealthStore.getState().setUserProfile(profile);
    Alert.alert('Thành công', 'Hồ sơ cá nhân đã được lưu.');
  };

  // --- XÓA DỮ LIỆU ---
  const handleClearData = () => {
    Alert.alert('Cảnh báo', 'Hành động này sẽ xóa toàn bộ lịch sử đo trên Firebase. Bạn có chắc không?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa ngay', style: 'destructive', onPress: async () => {
          setProcessingData(true);
          try {
            await clearAllHistory();
            Alert.alert('Đã xóa', 'Toàn bộ dữ liệu đã bị xóa.');
          } catch (e) {
            Alert.alert('Lỗi', 'Không thể xóa dữ liệu.');
          }
          setProcessingData(false);
      }},
    ]);
  };

  // --- TỐI ƯU LƯU TRỮ ---
  const handleOptimizeStorage = async () => {
    setProcessingData(true);
    try {
      await deleteOldHistory(30);
      Alert.alert('Đã tối ưu', 'Đã dọn dẹp các dữ liệu cũ (hơn 30 ngày) để giải phóng dung lượng.');
    } catch (e) {
      Alert.alert('Lỗi', 'Tối ưu hóa thất bại.');
    }
    setProcessingData(false);
  };

  // --- TỰ ĐỘNG XÓA ---
  const toggleAutoDelete = async (value: boolean) => {
    setIsAutoDelete(value);
    const days = value ? 30 : 0;
    await saveAutoDeleteDays(days);
    useHealthStore.getState().setAutoDeleteDays(days);
  };

  // --- ĐĂNG XUẤT ---
  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?', [
      { text: 'Hủy', style: 'cancel' },
      { 
        text: 'Đăng xuất', 
        style: 'destructive', 
        onPress: async () => {
          try {
            // 1. Dừng hệ thống chạy ngầm để không gọi API Firebase nữa
            heartMonitorController.stop(); 
            // 2. Thực hiện đăng xuất (AppNavigator sẽ tự động chuyển về màn Login)
            await logoutUser();
          } catch (error) {
            Alert.alert('Lỗi', 'Không thể đăng xuất. Vui lòng thử lại.');
          }
        }
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        <Text style={[styles.title, { color: colors.text }]}>Cài đặt</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Cấu hình hệ thống & Hồ sơ</Text>

        {/* 1. HỒ SƠ NGƯỜI DÙNG */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Hồ sơ người dùng</Text>
            
            <Text style={[styles.label, { color: colors.textSecondary }]}>Họ và tên</Text>
            <TextInput value={name} onChangeText={setName} placeholder="VD: Nguyễn Văn A" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: '31%' }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Tuổi</Text>
                <TextInput value={age} onChangeText={setAge} keyboardType="numeric" placeholder="25" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
              </View>
              <View style={{ width: '31%' }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Chiều cao</Text>
                <TextInput value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="170 (cm)" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
              </View>
              <View style={{ width: '31%' }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Cân nặng</Text>
                <TextInput value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="65 (kg)" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
              </View>
            </View>

            {/* --------> CHÈN ĐOẠN CODE SĐT KHẨN CẤP VÀO ĐÂY <-------- */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 10 }]}>SĐT Khẩn cấp (Người thân)</Text>
            <TextInput 
              value={emergencyPhone} 
              onChangeText={setEmergencyPhone} 
              keyboardType="phone-pad" 
              placeholder="VD: 0901234567" 
              placeholderTextColor={colors.textMuted} 
              style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} 
            />
            {/* -------------------------------------------------------- */}

            {/* Đây là nút Lưu Hồ Sơ */}
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSaveProfile}>
              <Text style={styles.primaryButtonText}>Lưu Hồ Sơ</Text>
            </TouchableOpacity>
          </View>
        {/* 2. QUẢN LÝ DỮ LIỆU */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Quản lý dữ liệu</Text>
          
          <View style={[styles.settingRow, { marginBottom: 20 }]}>
            <View style={styles.settingText}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Tự động xóa dữ liệu cũ</Text>
              <Text style={[styles.description, { color: colors.textMuted }]}>Tự động xóa bản ghi lịch sử cũ hơn 30 ngày.</Text>
            </View>
            <Switch value={isAutoDelete} onValueChange={toggleAutoDelete} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={'#FFFFFF'} />
          </View>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.successLight }]} onPress={handleOptimizeStorage} disabled={processingData}>
            <Text style={[styles.actionButtonText, { color: colors.success }]}>
              {processingData ? 'Đang xử lý...' : 'Tối ưu lưu trữ (Nén dung lượng)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.dangerLight, marginTop: 10 }]} onPress={handleClearData} disabled={processingData}>
            <Text style={[styles.actionButtonText, { color: colors.danger }]}>
              {processingData ? 'Đang xử lý...' : 'Xóa dữ liệu (Toàn bộ Firebase)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. NGƯỠNG THEO DÕI CẢNH BÁO */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Ngưỡng theo dõi</Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>BPM tối đa</Text>
          <TextInput value={maxBpm} onChangeText={setMaxBpm} keyboardType="numeric" placeholder="Ví dụ: 100" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
          
          <Text style={[styles.label, { color: colors.textSecondary }]}>SpO₂ tối thiểu</Text>
          <TextInput value={minSpo2} onChangeText={setMinSpo2} keyboardType="decimal-pad" placeholder="Ví dụ: 95" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
          
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSaveThresholds}>
            <Text style={styles.primaryButtonText}>Lưu ngưỡng</Text>
          </TouchableOpacity>
        </View>

        {/* 4. ABOUT SYSTEM */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.settingRow, { marginBottom: 15 }]}>
            <View style={styles.settingText}>
              <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Dark Mode</Text>
              <Text style={[styles.description, { color: colors.textMuted }]}>Giao diện tối.</Text>
            </View>
            <Switch value={isDark} onValueChange={async (val) => await setMode(val ? 'dark' : 'light')} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={'#FFFFFF'} />
          </View>

          <Text style={[styles.cardTitle, { color: colors.text, marginTop: 10 }]}>About System</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>Hệ thống giám sát nhịp tim và nồng độ oxy (SpO2) thời gian thực sử dụng ESP32, cảm biến MAX30102 và cơ sở dữ liệu Firebase.</Text>
          <Text style={[styles.version, { color: colors.textMuted }]}>Healthy Monitor App • Phiên bản 1.2.0</Text>
        </View>

        {/* 5. NÚT ĐĂNG XUẤT */}
        <TouchableOpacity 
          style={[styles.logoutButton, { backgroundColor: colors.dangerLight }]} 
          onPress={handleLogout}
        >
          <Text style={[styles.logoutButtonText, { color: colors.danger }]}>Đăng xuất khỏi tài khoản</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: 5, marginBottom: 22 },
  card: { borderRadius: 24, padding: 20, marginBottom: 16, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  cardTitle: { fontSize: 19, fontWeight: '800', marginBottom: 14 },
  itemTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 7 },
  input: { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 16, marginBottom: 16 },
  primaryButton: { height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  actionButton: { height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { fontSize: 14, fontWeight: '700' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingText: { flex: 1, paddingRight: 15 },
  description: { fontSize: 13, lineHeight: 21 },
  version: { fontSize: 12, marginTop: 15, fontWeight: '600' },
  
  // Style cho nút đăng xuất
  logoutButton: { height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 20 },
  logoutButtonText: { fontSize: 15, fontWeight: '700' },
});