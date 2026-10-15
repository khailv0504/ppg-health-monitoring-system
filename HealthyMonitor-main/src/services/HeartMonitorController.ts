import { Vibration, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

import { subscribeHealthData } from './healthService';
import { saveHealthHistory, deleteOldHistory } from './historyService';
import { saveHealthAlert } from './alertService';
import { loadThresholds, loadUserProfile, loadAutoDeleteDays } from './settingsService';
import { useHealthStore } from '../store/useHealthStore';
import { HealthData } from '../types';

class HeartMonitorController {
  private unsubscribeHealth: (() => void) | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  
  // Cờ trạng thái để chỉ kích hoạt chuỗi tự động 1 lần khi bắt đầu nguy hiểm
  private alertActive = { bpm: false, spo2: false };

  public async start() {
    if (this.saveInterval) return;

    await this.reloadThresholds();
    const profile = await loadUserProfile();
    const autoDeleteDays = await loadAutoDeleteDays();
    
    useHealthStore.getState().setUserProfile(profile);
    useHealthStore.getState().setAutoDeleteDays(autoDeleteDays);

    if (autoDeleteDays > 0) {
      deleteOldHistory(autoDeleteDays).catch(err => console.error("Lỗi tự dọn rác:", err));
    }

    this.unsubscribeHealth = subscribeHealthData(
      (data) => {
        useHealthStore.getState().setHealthData(data);
        useHealthStore.getState().setConnected(true);
        this.checkThresholdsAndAlert(data);
      },
      (error) => {
        console.error("Monitor Error:", error);
        useHealthStore.getState().setConnected(false);
      }
    );

    //this.saveInterval = setInterval(() => {
    //this.saveCurrentHistory();
    //}, 15000);
  }

  public async reloadThresholds() {
    const thresholds = await loadThresholds();
    useHealthStore.getState().setThresholds(thresholds);
    this.alertActive = { bpm: false, spo2: false };
  }

  private checkThresholdsAndAlert(data: HealthData) {
    const thresholds = useHealthStore.getState().thresholds;
    if (!thresholds || data.bpm <= 0 || data.spo2 <= 0) return;

    const { maxBpm, minSpo2 } = thresholds;
    const isBpmCritical = data.bpm > maxBpm;
    const isSpo2Critical = data.spo2 < minSpo2;

    let isNewlyCritical = false;
    let immediateMessage = "";

    // 1. KIỂM TRA BPM
    if (isBpmCritical) {
      if (!this.alertActive.bpm) {
        this.alertActive.bpm = true;
        isNewlyCritical = true;
        immediateMessage += `Nhịp tim: ${Math.round(data.bpm)} BPM (Vượt ngưỡng ${maxBpm})\n`;
        saveHealthAlert({ type: 'bpm', value: data.bpm, threshold: maxBpm, timestamp: Date.now(), message: `BPM ${Math.round(data.bpm)} vượt ngưỡng` });
      }
    } else {
      this.alertActive.bpm = false;
    }

    // 2. KIỂM TRA SPO2
    if (isSpo2Critical) {
      if (!this.alertActive.spo2) {
        this.alertActive.spo2 = true;
        isNewlyCritical = true;
        immediateMessage += `SpO₂: ${data.spo2.toFixed(1)}% (Thấp hơn ${minSpo2}%)\n`;
        saveHealthAlert({ type: 'spo2', value: data.spo2, threshold: minSpo2, timestamp: Date.now(), message: `SpO₂ ${data.spo2.toFixed(1)}% thấp ngưỡng` });
      }
    } else {
      this.alertActive.spo2 = false;
    }

    // 3. KÍCH HOẠT CHUỖI HÀNH ĐỘNG TỰ ĐỘNG LIÊN TIẾP
    if (isNewlyCritical) {
      this.executeAutomatedSOSSequence(immediateMessage.trim());
    }
  }

  // --- CHUỖI HÀNH ĐỘNG TỰ ĐỘNG LIÊN TIẾP ---
  private async executeAutomatedSOSSequence(alertMessage: string) {
    const profile = useHealthStore.getState().userProfile;
    const phone = profile?.emergencyPhone;

    // HÀNH ĐỘNG 1: Rung điện thoại liên tục dồn dập để báo động ngay lập tức
    Vibration.vibrate([0, 600, 200, 600, 200, 600, 200, 1000]);

    if (!phone) {
      console.warn('Chưa cấu hình SĐT khẩn cấp để thực thi tự động hóa.');
      return;
    }

    try {
      // HÀNH ĐỘNG 2: Tự động lấy tọa độ GPS ngầm ngay lập tức
      let { status } = await Location.requestForegroundPermissionsAsync();
      let locationLink = 'Không thể lấy vị trí GPS.';
      
      if (status === 'granted') {
        let location = await Location.getCurrentPositionAsync({});
        locationLink = `https://www.google.com/maps/search/?api=1&query=${location.coords.latitude},${location.coords.longitude}`;
      }

      // HÀNH ĐỘNG 3: Chuẩn bị nội dung thông điệp tự động
      const patientName = profile?.name || 'Bệnh nhân';
      const smsBody = `[SOS TỰ ĐỘNG] ${patientName} đang gặp nguy hiểm!\n${alertMessage}\nVị trí hiện tại: ${locationLink}`;

      // HÀNH ĐỘNG 4: Thực thi liên tiếp các giao thức truyền thông
      // Bước 4.1: Tự động mở sẵn ứng dụng Nhắn tin với nội dung và số điện thoại đã điền sẵn
      setTimeout(async () => {
        const smsUrl = Platform.OS === 'ios' 
          ? `sms:${phone}&body=${encodeURIComponent(smsBody)}` 
          : `sms:${phone}?body=${encodeURIComponent(smsBody)}`;
        
        if (await Linking.canOpenURL(smsUrl)) {
          Linking.openURL(smsUrl);
        }
      }, 500); // Trì hoãn 0.5 giây để xử lý mượt mà

      // Bước 4.2: Tự động chuyển tiếp sang màn hình Gọi điện khẩn cấp
      setTimeout(async () => {
        const telUrl = `tel:${phone}`;
        if (await Linking.canOpenURL(telUrl)) {
          Linking.openURL(telUrl);
        }
      }, 2000); // Sau 2 giây tiếp theo sẽ kích hoạt mở trình quay số gọi điện

    } catch (error) {
      console.error('Lỗi tự động hóa SOS:', error);
    }
  }

  public stop() {
    if (this.unsubscribeHealth) this.unsubscribeHealth();
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveInterval = null;
    useHealthStore.getState().setConnected(false);
  }
}

export const heartMonitorController = new HeartMonitorController();