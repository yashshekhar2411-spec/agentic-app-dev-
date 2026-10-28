// Metro bundles src/ into the JavaScript the app runs (index.android.bundle inside the APK).
// Expo's defaults already handle the "@/..." imports from tsconfig.json; add customisations below.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
