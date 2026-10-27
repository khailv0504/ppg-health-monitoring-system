import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import DashboardScreen from '../screens/DashboardScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

import { useTheme } from '../theme/ThemeContext';
import { useHealthStore } from '../store/useHealthStore';

import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from '../config/firebase';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// --- 1. LUỒNG KHI ĐÃ ĐĂNG NHẬP (App chính) ---
function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 70, paddingTop: 8, paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// --- 2. LUỒNG KHI CHƯA ĐĂNG NHẬP ---
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { colors, isDark } = useTheme();
  const authUser = useHealthStore(state => state.authUser);
  const isAuthLoading = useHealthStore(state => state.isAuthLoading);
  const setAuthUser = useHealthStore(state => state.setAuthUser);
  const setAuthLoading = useHealthStore(state => state.setAuthLoading);

  // Lắng nghe trạng thái đăng nhập của Firebase
  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const navigationTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.card, text: colors.text, border: colors.border, primary: colors.primary } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.card, text: colors.text, border: colors.border, primary: colors.primary } };

  // Màn hình chờ (Splash Screen) khi đang check đăng nhập
  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Quyết định hiển thị App hay Màn hình Login
  return (
    <NavigationContainer theme={navigationTheme}>
      {authUser ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}