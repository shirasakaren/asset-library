import 'server-only';
import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),

  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1).optional().default(''),
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_LOGOUT_REDIRECT: z.string().url(),

  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  SENTRY_ENVIRONMENT: z.string().default('development'),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  OPENAPI_SOURCE: z.string().optional(),
});

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default('MGM Asset Library'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_WS_URL: z.string().url(),

  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['en', 'id']).default('en'),
  NEXT_PUBLIC_SUPPORTED_LOCALES: z.string().default('en,id'),

  NEXT_PUBLIC_COMMUNITY_DOCS_URL: z.string().url(),
  NEXT_PUBLIC_COMMUNITY_LEARNING_URL: z.string().url(),
  NEXT_PUBLIC_COMMUNITY_HELP_URL: z.string().url(),

  NEXT_PUBLIC_AUTH_MOCK: z
    .union([z.literal('true'), z.literal('false'), z.literal('')])
    .default('false')
    .transform((v) => v === 'true'),

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, raw: Record<string, unknown>, label: string): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`[env] Invalid ${label} variables:\n${issues}`);
  }
  return result.data;
}

export const serverEnv = parse(ServerEnvSchema, process.env, 'server');
export const publicEnv = parse(PublicEnvSchema, process.env, 'public');

if (serverEnv.NODE_ENV === 'production' && publicEnv.NEXT_PUBLIC_AUTH_MOCK) {
  throw new Error('[env] NEXT_PUBLIC_AUTH_MOCK=true is not permitted in production.');
}
