import { 
  getAuth, 
  signInAnonymously, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut
  // Đã xóa GoogleAuthProvider và signInWithCredential
} from 'firebase/auth';

import * as AppleAuthentication from 'expo-apple-authentication';
import { app } from '../config/firebase'; 

// ĐÃ ẨN IMPORT GOOGLE ĐỂ KHÔNG BỊ LỖI TRÊN EXPO GO
// import { GoogleSignin } from '@react-native-google-signin/google-signin';

const auth = getAuth(app);

// ĐÃ ẨN CẤU HÌNH GOOGLE
// GoogleSignin.configure({
//   webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
// });

// ==========================================
// 1. ĐĂNG NHẬP TÀI KHOẢN KHÁCH (GUEST)
// ==========================================
export async function loginAsGuest() {
  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error('Lỗi đăng nhập khách:', error);
    throw error;
  }
}

// ==========================================
// 2. ĐĂNG KÝ BẰNG EMAIL & PASSWORD
// ==========================================
export async function registerWithEmail(email: string, pass: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    throw error;
  }
}

// ==========================================
// 3. ĐĂNG NHẬP BẰNG EMAIL & PASSWORD
// ==========================================
export async function loginWithEmail(email: string, pass: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error) {
    console.error('Lỗi đăng nhập email:', error);
    throw error;
  }
}

// ==========================================
// 4. ĐĂNG NHẬP BẰNG GMAIL (Tạm ẩn)
// ==========================================
export async function loginWithGoogle() {
  throw new Error('Tính năng Google Sign-in đang tạm ẩn để chạy trên Expo Go.');
}

// ==========================================
// 5. ĐĂNG NHẬP BẰNG APPLE
// ==========================================
export async function loginWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    return credential;
  } catch (e: any) {
    if (e.code === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    console.error('Lỗi đăng nhập Apple:', e);
    throw e;
  }
}

// ==========================================
// 6. ĐĂNG XUẤT
// ==========================================
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Lỗi đăng xuất:', error);
    throw error;
  }
}