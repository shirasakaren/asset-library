import { z } from 'zod';

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default('MGM Asset Library'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_WS_URL: z.string().url(),

  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['en', 'id']).default('en'),
  NEXT_PUBLIC_SUPPORTED_LOCALES: z.string().default('en,id'),

  // Community links are surfaced in the navbar dropdown. When unset, the
  // corresponding menu item is rendered greyed-out with a "Coming soon"
  // tooltip per the Part 4 spec.
  NEXT_PUBLIC_COMMUNITY_DOCS_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_COMMUNITY_LEARNING_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_COMMUNITY_HELP_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  NEXT_PUBLIC_AUTH_MOCK: z
    .union([z.literal('true'), z.literal('false'), z.literal('')])
    .default('false')
    .transform((v) => v === 'true'),

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

const raw = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  NEXT_PUBLIC_SUPPORTED_LOCALES: process.env.NEXT_PUBLIC_SUPPORTED_LOCALES,
  NEXT_PUBLIC_COMMUNITY_DOCS_URL: process.env.NEXT_PUBLIC_COMMUNITY_DOCS_URL,
  NEXT_PUBLIC_COMMUNITY_LEARNING_URL: process.env.NEXT_PUBLIC_COMMUNITY_LEARNING_URL,
  NEXT_PUBLIC_COMMUNITY_HELP_URL: process.env.NEXT_PUBLIC_COMMUNITY_HELP_URL,
  NEXT_PUBLIC_AUTH_MOCK: process.env.NEXT_PUBLIC_AUTH_MOCK,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

const result = PublicEnvSchema.safeParse(raw);
if (!result.success) {
  const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`[env.public] Invalid NEXT_PUBLIC_* variables:\n${issues}`);
}

export const publicEnv = result.data;
export const supportedLocales = publicEnv.NEXT_PUBLIC_SUPPORTED_LOCALES.split(',') as ('en' | 'id')[];
export type Locale = (typeof supportedLocales)[number];
