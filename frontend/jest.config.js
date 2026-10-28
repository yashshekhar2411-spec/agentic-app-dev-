// Unit tests: `npm test`. Test files live in __tests__/ (or next to the code as *.test.ts).
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1', // same "@/..." imports as tsconfig.json
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/android/', '<rootDir>/ios/'],
};
