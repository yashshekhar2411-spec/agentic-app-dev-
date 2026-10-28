// EXPO_PUBLIC_* values are baked into the build at bundle time. None of these are secrets.
export const env = {
  DEFAULT_SERVER_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000',
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID ?? '',
  },
  // Firebase console → Authentication → Sign-in method → Google → Web SDK configuration → Web client ID
  GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
};
