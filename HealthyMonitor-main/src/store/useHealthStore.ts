import { create } from 'zustand';
import { HealthData, HealthThresholds, UserProfile } from '../types';

interface HealthState {
  healthData: HealthData;
  thresholds: HealthThresholds | null;
  isConnected: boolean;
  
  userProfile: UserProfile | null;
  autoDeleteDays: number;
  
  // ---> THÊM TRẠNG THÁI NGƯỜI DÙNG (AUTH) <---
  authUser: any | null; // Có thể đổi thành User của Firebase Auth
  isAuthLoading: boolean; 
  
  // Actions
  setHealthData: (data: HealthData) => void;
  setThresholds: (thresholds: HealthThresholds | null) => void;
  setConnected: (status: boolean) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setAutoDeleteDays: (days: number) => void;
  
  // ---> THÊM ACTIONS AUTH <---
  setAuthUser: (user: any | null) => void;
  setAuthLoading: (status: boolean) => void;
}

const DEFAULT_DATA: HealthData = {
  bpm: 0, spo2: 0, status: 'Đang kết nối...', timestamp: undefined,
};

export const useHealthStore = create<HealthState>((set) => ({
  healthData: DEFAULT_DATA,
  thresholds: null,
  isConnected: false,
  userProfile: null,
  autoDeleteDays: 0,
  
  authUser: null,
  isAuthLoading: true, // Mặc định là true để chờ check auth khi mở app
  
  setHealthData: (data) => set({ healthData: data }),
  setThresholds: (thresholds) => set({ thresholds }),
  setConnected: (status) => set({ isConnected: status }),
  setUserProfile: (profile) => set({ userProfile: profile }),
  setAutoDeleteDays: (days) => set({ autoDeleteDays: days }),
  
  setAuthUser: (user) => set({ authUser: user }),
  setAuthLoading: (status) => set({ isAuthLoading: status }),
}));