import { NestFastifyApplication } from '@nestjs/platform-fastify';
import supertest from 'supertest';
import { buildTestModuleWithFakeKeycloak } from './harness/fake-keycloak';

/**
 * Scenario 16 — Idempotency-Key replay. Two POSTs to the same endpoint with
 * the same key + identical body must return the identical response and
 * MUST NOT create a duplicate row.
 */
describe('E2E [16] idempotency on POST /assets', () => {
  let app: NestFastifyApplication;
  let token: string;

  beforeAll(async () => {
    const { fake, builder } = await buildTestModuleWithFakeKeycloak();
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new (await import('@nestjs/platform-fastify')).FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    token = await fake.mintToken('kc-idem-bob', 'idem-bob@labmgm.org', 'Bob');
  });

  afterAll(async () => {
    await app.close();
  });

  it('replays the first response on retry, no duplicate', async () => {
    const idemKey = `idem-${Date.now()}`;
    const { PrismaService } = await import('../../src/infra/prisma/prisma.service');
    const prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow();
    const license = await prisma.license.findFirstOrThrow();
    const body = {
      title: `Idem Asset ${Date.now()}`,
      engine: 'UNITY',
      categoryId: category.id,
      licenseId: license.id,
      semver: '1.0.0',
      translations: [
        { locale: 'en', shortDescription: 'x', longDescription: { type: 'doc', content: [] } },
      ],
    };
    const a = await supertest(app.getHttpServer())
      .post('/assets')
