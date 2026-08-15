import { ConnectionRegistry } from '../../src/modules/ws/connection-registry';

const fakeSocket = (): import('ws') => ({ readyState: 1 }) as unknown as import('ws');

describe('ConnectionRegistry', () => {
  it('adds + lists sockets per user', () => {
    const reg = new ConnectionRegistry();
    const s1 = fakeSocket();
    const s2 = fakeSocket();
    reg.add('u1', s1);
    reg.add('u1', s2);
    expect(reg.forUser('u1')).toHaveLength(2);
    expect(reg.forUser('u2')).toEqual([]);
  });

  it('removes one socket without affecting others', () => {
    const reg = new ConnectionRegistry();
    const s1 = fakeSocket();
    const s2 = fakeSocket();
    reg.add('u1', s1);
    reg.add('u1', s2);
    reg.remove('u1', s1);
    expect(reg.forUser('u1')).toEqual([s2]);
  });

  it('drops the user entry when the last socket is removed', () => {
    const reg = new ConnectionRegistry();
    const s1 = fakeSocket();
    reg.add('u1', s1);
    reg.remove('u1', s1);
    expect(reg.forUser('u1')).toEqual([]);
    expect(reg.totalSockets()).toBe(0);
  });
});
