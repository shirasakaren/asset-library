import { PluginTokenService } from '../../src/infra/keycloak/plugin-token.service';
import { AppConfigService } from '../../src/config/app-config.service';

function makeConfig(overrides: Record<string, unknown> = {}): AppConfigService {
  const env = {
    PLUGIN_TOKEN_PEPPER: 'this-is-a-test-pepper-1234',
    PLUGIN_TOKEN_TTL_DAYS: 90,
    NODE_ENV: 'development',
    ...overrides,
  } as Record<string, unknown>;
  return {
    get: (key: string) => env[key],
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isStaging: env.NODE_ENV === 'staging',
  } as unknown as AppConfigService;
}

describe('PluginTokenService.hash', () => {
  it('is deterministic for the same input', () => {
    const svc = new PluginTokenService({} as never, makeConfig());
    expect(svc.hash('abc')).toBe(svc.hash('abc'));
  });

  it('changes when the pepper changes', () => {
    const a = new PluginTokenService(
      {} as never,
      makeConfig({ PLUGIN_TOKEN_PEPPER: 'AAA-AAA-AAA-AAA' }),
    );
    const b = new PluginTokenService(
      {} as never,
      makeConfig({ PLUGIN_TOKEN_PEPPER: 'BBB-BBB-BBB-BBB' }),
    );
    expect(a.hash('abc')).not.toBe(b.hash('abc'));
  });

  it('refuses to construct in production without a pepper', () => {
    expect(
      () =>
        new PluginTokenService(
          {} as never,
          makeConfig({ NODE_ENV: 'production', PLUGIN_TOKEN_PEPPER: '' }),
        ),
    ).toThrow();
  });
});
