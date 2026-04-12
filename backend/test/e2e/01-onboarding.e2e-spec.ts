import { NestFastifyApplication } from '@nestjs/platform-fastify';
import supertest from 'supertest';
import { buildTestModuleWithFakeKeycloak } from './harness/fake-keycloak';

/**
 * Scenario 1 — A fresh user authenticates for the first time. We expect:
 *   - the User row is upserted with `keycloakSub` matching the JWT `sub`;
 *   - the bootstrap admin email returns isAdmin=true + role='admin';
 *   - non-bootstrap users come up as role='user'.
 */
describe('E2E [01] onboarding', () => {
  let app: NestFastifyApplication;
  let fake: Awaited<ReturnType<typeof buildTestModuleWithFakeKeycloak>>['fake'];

  beforeAll(async () => {
    const { fake: f, builder } = await buildTestModuleWithFakeKeycloak();
    fake = f;
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new (await import('@nestjs/platform-fastify')).FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('upserts a normal user and resolves role=user', async () => {
    const token = await fake.mintToken('kc-sub-alice', 'alice@labmgm.org', 'Alice');
    const res = await supertest(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      email: 'alice@labmgm.org',
      displayName: 'Alice',
      role: 'user',
      isAdmin: false,
    });
    expect(res.body.avatar.initials).toBe('A');
  });

  it('promotes the bootstrap admin on first sight', async () => {
    const token = await fake.mintToken('kc-sub-admin', 'admin@labmgm.org', 'Bootstrap Admin');
    const res = await supertest(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.isAdmin).toBe(true);
    expect(res.body.role).toBe('admin');
  });
});
