import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';

/**
 * Logs request duration + outcome at debug level. Sits alongside `pino-http`
 * which logs the request line; this adds the handler-level timing useful when
 * diagnosing slow routes.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logger.debug(`${req.method} ${req.url} ${Date.now() - start}ms`),
        error: (err) =>
          this.logger.debug(
            `${req.method} ${req.url} ERR ${Date.now() - start}ms: ${(err as Error).message}`,
          ),
      }),
    );
  }
}
