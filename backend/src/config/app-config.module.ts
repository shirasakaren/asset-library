import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';

/**
 * Global config module. Loads `.env` (in dev) and validates every variable
 * via the Zod schema in `env.schema.ts`. AppConfigService is the typed
 * accessor used by feature modules.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Validate every variable up-front; throws an aggregated error on failure.
      validate: (raw) => validateEnv(raw as NodeJS.ProcessEnv),
      // Allow .env.<NODE_ENV>.local > .env.local > .env.<NODE_ENV> > .env.
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
