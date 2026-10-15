import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

export interface AppColors {
  background: string;
  card: string;
  cardSecondary: string;

  text: string;
  textSecondary: string;
  textMuted: string;

  border: string;
  borderLight: string;

  primary: string;
  primaryDark: string;
  primaryLight: string;

  bpm: string;
  bpmLight: string;

  spo2: string;
  spo2Light: string;

  success: string;
  successLight: string;

  warning: string;
  warningLight: string;

  danger: string;
  dangerLight: string;

  chartGrid: string;
  chartLabel: string;

  input: string;
}

const LIGHT_COLORS: AppColors = {
  background: '#F4F7FB',
  card: '#FFFFFF',
  cardSecondary: '#F8FAFC',

  text: '#111827',
  textSecondary: '#475569',
  textMuted: '#7A8799',

  border: '#E2E8F0',
  borderLight: '#EEF2F7',

  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#EFF6FF',

  bpm: '#E05F6D',
  bpmLight: '#FCE7EA',

  spo2: '#168B8B',
  spo2Light: '#DDF6F4',

  success: '#16A34A',
  successLight: '#DCFCE7',

  warning: '#D97706',
  warningLight: '#FEF3C7',

  danger: '#DC2626',
  dangerLight: '#FEE2E2',

  chartGrid: '#E2E8F0',
  chartLabel: '#64748B',

  input: '#FFFFFF',
};

const DARK_COLORS: AppColors = {
  background: '#0B1120',
  card: '#111827',
  cardSecondary: '#172033',

  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',

  border: '#273449',
  borderLight: '#1E293B',

  primary: '#60A5FA',
  primaryDark: '#93C5FD',
  primaryLight: '#172554',

  bpm: '#FB7185',
  bpmLight: '#4C1D27',

  spo2: '#2DD4BF',
  spo2Light: '#134E4A',

  success: '#4ADE80',
  successLight: '#14532D',

  warning: '#FBBF24',
  warningLight: '#78350F',

  danger: '#F87171',
  dangerLight: '#7F1D1D',

  chartGrid: '#334155',
  chartLabel: '#94A3B8',

  input: '#172033',
};

const THEME_KEY = 'appThemeMode';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: AppColors;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext =
  createContext<ThemeContextValue | undefined>(
    undefined
  );

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [mode, setModeState] =
    useState<ThemeMode>('light');

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(THEME_KEY)
      .then(value => {
        if (!mounted) return;

        if (
          value === 'dark' ||
          value === 'light'
        ) {
          setModeState(value);
        }
      })
      .catch(error => {
        console.error(
          'Lỗi đọc chế độ giao diện:',
          error
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setMode = async (
    nextMode: ThemeMode
  ) => {
    setModeState(nextMode);

    try {
      await AsyncStorage.setItem(
        THEME_KEY,
        nextMode
      );
    } catch (error) {
      console.error(
        'Lỗi lưu chế độ giao diện:',
        error
      );
    }
  };

  const toggleTheme = async () => {
    await setMode(
      mode === 'light'
        ? 'dark'
        : 'light'
    );
  };

  const colors = useMemo(
    () =>
      mode === 'dark'
        ? DARK_COLORS
        : LIGHT_COLORS,
    [mode]
  );

  const value = useMemo(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors,
      setMode,
      toggleTheme,
    }),
    [mode, colors]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context =
    useContext(ThemeContext);

  if (!context) {
    throw new Error(
      'useTheme phải được sử dụng bên trong ThemeProvider'
    );
  }

  return context;
}