// Code checks: `npm run lint`. https://docs.expo.dev/guides/using-eslint/
// (The modern replacement for .eslintrc.js.)
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'vendor/*'],
  },
]);
