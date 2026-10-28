// Native modules don't exist in tests: swap them for in-memory fakes.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Unit tests never reach the backend (or Firebase sign-in, which the API client loads): a test that needs an
// answer sets one with jest.mocked(api).mockResolvedValue(...)
jest.mock('@/services/api/client', () => ({
  api: jest.fn(() => Promise.reject(new Error('No server in tests'))),
  ApiError: class ApiError extends Error {},
}));
