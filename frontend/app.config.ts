import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Agentic Call',
  slug: 'agentic-call',
  scheme: 'agenticcall',
  version: '1.3.4',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.agentic.callcenter',
    supportsTablet: true,
  },
  android: {
    package: 'com.agentic.callcenter',
    edgeToEdgeEnabled: true,
  },
  plugins: [
    'expo-router',
    // Lets the app talk to a plain-http dev backend (e.g. http://10.0.2.2:8000 from the emulator)
    ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
  ],
};

export default config;
