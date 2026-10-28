import { serverAfterUpdate } from '@/features/profile/store';

const NEW = 'https://new-tunnel.trycloudflare.com';

describe('server address after an app update', () => {
  it('drops an old quick-tunnel address the person typed in', () => {
    expect(serverAfterUpdate({ serverUrl: 'https://honest-pieces-comes-hats.trycloudflare.com', builtWithUrl: 'https://old.trycloudflare.com' }, NEW)).toBe(NEW);
  });
  it('drops the old default, and saves from before this existed', () => {
    expect(serverAfterUpdate({ serverUrl: 'https://old.trycloudflare.com', builtWithUrl: 'https://old.trycloudflare.com' }, NEW)).toBe(NEW);
    expect(serverAfterUpdate({ serverUrl: 'https://old.trycloudflare.com' }, NEW)).toBe(NEW);
  });
  it('keeps a server the person chose on purpose', () => {
    expect(serverAfterUpdate({ serverUrl: 'http://192.168.1.20:8000', builtWithUrl: 'https://old.trycloudflare.com' }, NEW)).toBe('http://192.168.1.20:8000');
  });
  it('changes nothing when the build is the same', () => {
    expect(serverAfterUpdate({ serverUrl: 'https://custom.trycloudflare.com', builtWithUrl: NEW }, NEW)).toBe('https://custom.trycloudflare.com');
    expect(serverAfterUpdate({}, NEW)).toBe(NEW);
  });
});
