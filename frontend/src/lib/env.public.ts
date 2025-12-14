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
