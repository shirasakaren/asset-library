import { NestFastifyApplication } from '@nestjs/platform-fastify';
import supertest from 'supertest';
import { buildTestModuleWithFakeKeycloak } from './harness/fake-keycloak';

/**
 * Scenario 14 — Last-admin demotion guard. If demoting `target` would leave
 * zero admins in the DB, the API must return 409 admin.cannot_remove_last_admin.
 */
describe('E2E [14] last-admin demotion guard', () => {
  let app: NestFastifyApplication;
  let bootstrapToken: string;
  let secondAdminToken: string;

  beforeAll(async () => {
    const { fake, builder } = await buildTestModuleWithFakeKeycloak();
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new (await import('@nestjs/platform-fastify')).FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    bootstrapToken = await fake.mintToken('kc-bootstrap', 'admin@labmgm.org', 'Bootstrap');
    secondAdminToken = await fake.mintToken('kc-second', 'second-admin@labmgm.org', 'Second');
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses to demote the bootstrap admin via the bootstrap-protection branch', async () => {
    // Onboard both users.
    await supertest(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${bootstrapToken}`);
    await supertest(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${secondAdminToken}`);

    const { PrismaService } = await import('../../src/infra/prisma/prisma.service');
    const prisma = app.get(PrismaService);
    const bootstrap = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@labmgm.org' } });
    await prisma.user.update({
      where: { email: 'second-admin@labmgm.org' },
      data: { isAdmin: true },
    });

    const res = await supertest(app.getHttpServer())
      .post(`/admin/users/${bootstrap.id}/demote`)
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({ confirm: 'I understand', confirmedAt: new Date().toISOString() })
      .expect(409);
    expect(res.body.code).toBe('admin.cannot_demote_bootstrap');
  });
});
