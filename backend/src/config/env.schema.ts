import { z } from 'zod';

/**
 * Zod schema for every environment variable consumed by the backend.
 *
 * Boot fails fast if any required value is missing or malformed; this lets us
 * surface configuration mistakes immediately instead of at first traffic.
 */

const booleanFromString = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'TRUE', 'True', 'yes', 'on'].includes(value);
});

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const portNumber = z.coerce.number().int().min(1).max(65535);

export const envSchema = z
  .object({
    // ─────────── Runtime ────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PROCESS_ROLE: z.enum(['api', 'worker']).default('api'),
    PORT: portNumber.default(4000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    TRUST_PROXY: booleanFromString.default(true),
    CORS_ORIGINS: csv.default('http://localhost:3000'),
    PUBLIC_BASE_URL: z.string().url(),
    METRICS_ALLOW_CIDRS: csv.default(''),

    // ─────────── Postgres ───────────────────────────────────────────────────
    DATABASE_URL: z.string().min(1),

    // ─────────── Mongo ──────────────────────────────────────────────────────
    MONGO_URL: z.string().min(1),

    // ─────────── Redis ──────────────────────────────────────────────────────
    REDIS_URL: z.string().min(1),

    // ─────────── Keycloak ───────────────────────────────────────────────────
    KEYCLOAK_ISSUER_URL: z.string().url(),
    KEYCLOAK_AUDIENCE: z.string().min(1),
    KEYCLOAK_JWKS_URI: z.string().url(),
    KEYCLOAK_ALGORITHMS: z
      .string()
      .default('RS256')
      .transform((value) => value.split(',').map((s) => s.trim())),
    KEYCLOAK_CLOCK_TOLERANCE_SEC: z.coerce.number().int().nonnegative().default(30),
    KEYCLOAK_JWKS_CACHE_TTL_SEC: z.coerce.number().int().positive().default(3600),
    ADMIN_BOOTSTRAP_EMAIL: z.string().email().default('admin@labmgm.org'),

    // ─────────── Plugin device tokens ───────────────────────────────────────
    PLUGIN_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
    PLUGIN_TOKEN_PEPPER: z.string().optional(),

    // ─────────── S3 ─────────────────────────────────────────────────────────
    S3_REGION: z.string().default('us-east-1'),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanFromString.default(false),
    S3_BUCKET_ASSETS: z.string().min(1),
    S3_BUCKET_THUMBS: z.string().min(1),
    S3_BUCKET_EDITOR_MEDIA: z.string().min(1),
    S3_PRESIGN_EXPIRES_SEC: z.coerce.number().int().positive().default(3600),

    // ─────────── Meilisearch ────────────────────────────────────────────────
    MEILI_URL: z.string().url(),
    MEILI_MASTER_KEY: z.string().optional().default(''),

    // ─────────── Mail (Mailtrap) ────────────────────────────────────────────
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: portNumber.default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    SMTP_FROM: z.string().default('MGM Asset Library <no-reply@labmgm.org>'),

    // ─────────── n8n ────────────────────────────────────────────────────────
    N8N_WEBHOOK_URL: z.string().optional().default(''),
    N8N_WEBHOOK_SECRET: z.string().optional().default(''),

    // ─────────── GIF providers (comment composer) ───────────────────────────
    // Server-side keys for the /gifs proxy. Empty disables that provider.
    GIPHY_API_KEY: z.string().optional().default(''),
    TENOR_API_KEY: z.string().optional().default(''),

    // ─────────── Sentry ─────────────────────────────────────────────────────
    SENTRY_DSN: z.string().optional().default(''),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    SENTRY_ENVIRONMENT: z.string().default('development'),

    // ─────────── Background tool paths (worker container only) ────────────
    BLENDER_BIN: z.string().default('/usr/bin/blender'),
    CLAMSCAN_BIN: z.string().default('/usr/bin/clamscan'),
    FFMPEG_BIN: z.string().default('/usr/bin/ffmpeg'),
    FFPROBE_BIN: z.string().default('/usr/bin/ffprobe'),
    GLTF_PIPELINE_BIN: z.string().default('/usr/local/bin/gltf-pipeline'),
    GLTFPACK_BIN: z.string().default('/usr/local/bin/gltfpack'),
    PYANALYZE_VENV: z.string().default('/opt/mgm-py'),
    HDRI_PATH: z.string().default('/opt/mgm/hdri/studio_small_03.hdr'),
    WORKER_SCRATCH_DIR: z.string().default('/tmp/mgm-analyze'),

    // ─────────── Worker job limits ──────────────────────────────────────────
    ANALYZE_TIMEOUT_SEC: z.coerce.number().int().positive().default(300),
    GLTF_CONVERT_TIMEOUT_SEC: z.coerce.number().int().positive().default(600),
    GLTFPACK_KTX2: booleanFromString.default(false),

    // ─────────── Search indexer ─────────────────────────────────────────────
    SEARCH_INDEX_BATCH_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

    // ─────────── Retention ──────────────────────────────────────────────────
    ARCHIVE_PURGE_DAYS: z.coerce.number().int().positive().default(30),
    AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    WEBHOOK_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    DOWNLOAD_RAW_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

    // ─────────── Feature flags ──────────────────────────────────────────────
    FEATURE_SWAGGER_PUBLIC: booleanFromString.default(false),
    FEATURE_QUEUE_DASHBOARD: booleanFromString.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.PLUGIN_TOKEN_PEPPER || env.PLUGIN_TOKEN_PEPPER.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PLUGIN_TOKEN_PEPPER'],
          message: 'PLUGIN_TOKEN_PEPPER is required (>= 16 chars) in production.',
        });
      }
      if (!env.SENTRY_DSN) {
        // not fatal — Sentry just no-ops — but warn loudly via Pino later.
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validate process.env and return a fully typed config object.
 * Throws an aggregate error containing every issue so ops can fix them at once.
 */
export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(
      `Environment validation failed:\n${lines.join('\n')}\n` +
        'Refer to .env.example for the complete reference.',
    );
  }
  return result.data;
}
