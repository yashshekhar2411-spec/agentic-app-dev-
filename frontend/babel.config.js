// Turns the app's TypeScript/JSX into JavaScript for Metro (the app bundle) and Jest (the tests).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
