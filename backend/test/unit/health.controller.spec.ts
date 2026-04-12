import { HealthController } from '../../src/health/health.controller';

describe('HealthController', () => {
  it('returns ok from /healthz regardless of subsystem state', () => {
    const controller = new HealthController(
      { ping: jest.fn() } as never,
      { ping: jest.fn() } as never,
      { ping: jest.fn() } as never,
      { ping: jest.fn() } as never,
      { ping: jest.fn() } as never,
    );
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('reports degraded when any subsystem ping fails', async () => {
    const controller = new HealthController(
      { ping: jest.fn().mockResolvedValue(true) } as never,
      { ping: jest.fn().mockResolvedValue(true) } as never,
      { ping: jest.fn().mockResolvedValue(false) } as never, // mongo down
      { ping: jest.fn().mockResolvedValue(true) } as never,
      { ping: jest.fn().mockResolvedValue(true) } as never,
    );
    const report = await controller.readiness();
    expect(report.status).toBe('degraded');
    expect(report.checks.mongo).toBe(false);
    expect(report.checks.postgres).toBe(true);
  });

  it('reports ok when every subsystem is reachable', async () => {
    const ok = { ping: jest.fn().mockResolvedValue(true) } as never;
    const controller = new HealthController(ok, ok, ok, ok, ok);
    const report = await controller.readiness();
    expect(report.status).toBe('ok');
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
  });
});
