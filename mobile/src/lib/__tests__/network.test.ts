// mobile/src/lib/__tests__/network.test.ts
import * as Network from 'expo-network';
import { isOffline, onOnline } from '../network';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() }));
const getState = Network.getNetworkStateAsync as jest.Mock;
const addListener = Network.addNetworkStateListener as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('끊겼거나 인터넷에 못 닿으면 오프라인, 모르면 온라인', async () => {
  getState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
  expect(await isOffline()).toBe(true);
  getState.mockResolvedValue({ isConnected: true, isInternetReachable: false });
  expect(await isOffline()).toBe(true);
  getState.mockResolvedValue({ isConnected: true, isInternetReachable: null });
  expect(await isOffline()).toBe(false);
  getState.mockRejectedValue(new Error('no module'));
  expect(await isOffline()).toBe(false);
});

test('onOnline은 오프라인→온라인으로 바뀔 때만 부른다', () => {
  const remove = jest.fn();
  let emit: (s: object) => void = () => {};
  addListener.mockImplementation((l: (s: object) => void) => {
    emit = l;
    return { remove };
  });
  const cb = jest.fn();
  const off = onOnline(cb);
  emit({ isConnected: true, isInternetReachable: true }); // 처음부터 온라인
  expect(cb).not.toHaveBeenCalled();
  emit({ isConnected: false, isInternetReachable: false });
  emit({ isConnected: true, isInternetReachable: true });
  expect(cb).toHaveBeenCalledTimes(1);
  emit({ isConnected: true, isInternetReachable: true });
  expect(cb).toHaveBeenCalledTimes(1);
  off();
  expect(remove).toHaveBeenCalled();
});
