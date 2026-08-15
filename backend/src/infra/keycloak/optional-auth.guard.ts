import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { extractPluginToken } from './plugin-token.guard';
import { FlexibleAuthGuard } from './flexible-auth.guard';

/**
 * Lets the request through with or without credentials. When credentials ARE
 * present, the same parsing as `FlexibleAuthGuard` runs so downstream handlers
 * see `request.user`; when absent, `request.user` stays undefined.
 *
 * Used by endpoints whose response shape varies for guests (e.g. asset detail
 * without `isSaved`/`canEdit`).
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly flexible: FlexibleAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const hasBearer = req.headers.authorization?.toLowerCase().startsWith('bearer ');
    const hasPlugin = !!extractPluginToken(req);
    if (!hasBearer && !hasPlugin) return true;
    try {
      await this.flexible.canActivate(context);
    } catch {
      // Bad credentials present → ignore them, treat as guest. The handler
      // can still respond with the public projection.
    }
    return true;
  }
}
