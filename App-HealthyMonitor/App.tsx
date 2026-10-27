import React, { useEffect } from 'react';
import { ThemeProvider } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';

import { heartMonitorController } from './src/services/HeartMonitorController';

export default function App() {
  
  useEffect(() => {
    // Chạy khi app mở lên
    heartMonitorController.start();

    // Dọn dẹp khi app tắt hoàn toàn
    return () => {
      heartMonitorController.stop();
    };
  }, []);

  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}