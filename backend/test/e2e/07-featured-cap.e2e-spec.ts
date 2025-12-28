import { NestFastifyApplication } from '@nestjs/platform-fastify';
import supertest from 'supertest';
import { buildTestModuleWithFakeKeycloak } from './harness/fake-keycloak';

/**
 * Scenario 8 — Featured slot active cap. The 6th active slot must be rejected
 * with featured.active_cap_reached. Hot path of the admin panel.
 */
describe('E2E [08] featured slot active cap', () => {
  let app: NestFastifyApplication;
  let adminToken: string;

  beforeAll(async () => {
    const { fake, builder } = await buildTestModuleWithFakeKeycloak();
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new (await import('@nestjs/platform-fastify')).FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    adminToken = await fake.mintToken('kc-admin', 'admin@labmgm.org', 'Admin');
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses the 6th active slot', async () => {
    const { PrismaService } = await import('../../src/infra/prisma/prisma.service');
    const prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow();
    const license = await prisma.license.findFirstOrThrow();
    const owner = await prisma.user.upsert({
      where: { keycloakSub: 'kc-feat-owner' },
      create: {
        keycloakSub: 'kc-feat-owner',
        email: 'feat-owner@labmgm.org',
        displayName: 'Owner',
      },
      update: {},
    });
    const assetIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = await prisma.asset.create({
