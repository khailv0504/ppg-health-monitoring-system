import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, 
  Platform, ImageBackground, Image, useWindowDimensions
} from 'react-native';

import { loginWithEmail, loginAsGuest } from '../services/authService';

export default function LoginScreen({ navigation }: any) {
  // Lấy kích thước màn hình để tự động đổi layout (Dọc cho điện thoại, Ngang cho Tablet)
  const { width } = useWindowDimensions();
  const isTablet = width >= 768; 

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }
    setIsLoading(true);
    try {
      await loginWithEmail(email, password);
    } catch (error: any) {
      Alert.alert('Đăng nhập thất bại', error.message || 'Sai tài khoản hoặc mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    try {
      await loginAsGuest();
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể đăng nhập dưới dạng khách.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground 
        source={require('../../assets/background.jpg')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.overlay}
        >
          {/* Khung Card màu trắng bao bọc toàn bộ form */}
          <View style={[styles.cardContainer, { maxWidth: isTablet ? 850 : 400 }, isTablet && styles.cardRow]}>
            
            {/* Vùng chứa Logo */}
            <View style={[styles.logoSection, isTablet && styles.logoSectionRow]}>
              <Image 
                source={require('../../assets/logo.jpg')} 
                style={[styles.logo, isTablet && styles.logoTablet]}
                resizeMode="contain"
              />
            </View>

            {/* Đường kẻ dọc chia cắt (Chỉ hiện trên Tablet/Web) */}
            {isTablet && <View style={styles.divider} />}

            {/* Vùng chứa Form đăng nhập */}
            <View style={[styles.formSection, isTablet && styles.formSectionRow]}>
              
              <Text style={styles.title}>Hệ Thống Giám Sát Nhịp Tim{'\n'}Và Nồng Độ Oxi</Text>

              <View style={styles.formContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Email sinh viên (VD: 21119233@...)"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Mật khẩu"
                  placeholderTextColor="#999"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />

                <TouchableOpacity 
                  style={styles.primaryButton} 
                  onPress={handleLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>ĐĂNG NHẬP</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.guestButton} 
                  onPress={handleGuestLogin}
                  disabled={isLoading}
                >
                  <Text style={styles.guestButtonText}>Đăng nhập Khách</Text>
                </TouchableOpacity>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Chưa có tài khoản? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isLoading}>
                    <Text style={styles.registerLink}>Đăng ký ngay</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          </View>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1 
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 15, 40, 0.65)', // Làm tối nền hơn một chút để Card trắng nổi bật
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20, // Tạo khoảng cách an toàn với mép màn hình
  },
  cardContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 25,
    width: '100%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 40,
  },
  logoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoSectionRow: {
    flex: 1,
    marginBottom: 0,
  },
  logo: {
    width: 110, // Thu nhỏ logo trên điện thoại để form không bị quá dài
    height: 110,
  },
  logoTablet: {
    width: 180,
    height: 180,
  },
  divider: {
    width: 1,
    height: '85%',
    backgroundColor: '#eeeeee',
    marginHorizontal: 30,
  },
  formSection: {
    width: '100%',
  },
  formSectionRow: {
    flex: 1.3,
  },
  title: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#1a365d', // Đổi tiêu đề sang màu xanh đen cho sang trọng
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 25,
  },
  formContainer: { 
    width: '100%' 
  },
  input: { 
    height: 52, 
    backgroundColor: '#f5f7fa', // Màu nền xám xanh nhạt 
    borderRadius: 26, // Bo cong tròn
    paddingHorizontal: 22, 
    fontSize: 14.5, 
    marginBottom: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e4e7eb',
  },
  primaryButton: { 
    height: 52, 
    backgroundColor: '#2ecc71',
    borderRadius: 26, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 8,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  guestButton: { 
    height: 52, 
    backgroundColor: '#ffffff',
    borderWidth: 1.5, 
    borderColor: '#e4e7eb',
    borderRadius: 26, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 16,
  },
  guestButtonText: { 
    fontSize: 15, 
    fontWeight: '600',
    color: '#666',
  },
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 24,
  },
  footerText: { 
    fontSize: 14,
    color: '#777',
  },
  registerLink: { 
    fontSize: 14, 
    fontWeight: 'bold',
    color: '#2ecc71',
  },
});