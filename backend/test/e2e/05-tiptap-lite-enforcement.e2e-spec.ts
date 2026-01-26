import { NestFastifyApplication } from '@nestjs/platform-fastify';
import supertest from 'supertest';
import { buildTestModuleWithFakeKeycloak } from './harness/fake-keycloak';
import { ErrorCode } from '../../src/common/errors/error-code';

/**
 * Scenario 15 — Lite TipTap enforcement. A comment containing a disallowed
 * `image` node must be rejected with `comment.lite_tiptap_violation`.
 *
 * Requires a published asset in the DB; we seed one inline.
 */
describe('E2E [15] TipTap lite enforcement on comments', () => {
  let app: NestFastifyApplication;
  let aliceToken: string;
  let assetId: string;

  beforeAll(async () => {
    const { fake, builder } = await buildTestModuleWithFakeKeycloak();
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new (await import('@nestjs/platform-fastify')).FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    aliceToken = await fake.mintToken('kc-tt-alice', 'tt-alice@labmgm.org', 'Alice');
    // Bootstrap an asset directly — Prisma is available via the app.
    const { PrismaService } = await import('../../src/infra/prisma/prisma.service');
    const prisma = app.get(PrismaService);
    const license = await prisma.license.findFirstOrThrow();
    const category = await prisma.category.findFirstOrThrow();
    const owner = await prisma.user.upsert({
      where: { keycloakSub: 'kc-tt-alice' },
      create: { keycloakSub: 'kc-tt-alice', email: 'tt-alice@labmgm.org', displayName: 'Alice' },
      update: {},
    });
    const asset = await prisma.asset.create({
