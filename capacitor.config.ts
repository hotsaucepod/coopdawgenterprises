import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coopdawg.malltycoon',
  appName: 'Mall Tycoon',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#1b1f2a',
  },
};

export default config;
