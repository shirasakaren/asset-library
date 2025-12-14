import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppConfigService } from '../../config/app-config.service';
import { SentryService } from '../../infra/sentry/sentry.service';
import { DomainException, ProblemFieldDto } from '../errors/problem.dto';

interface ProblemPayload {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  code: string;
  fields?: ProblemFieldDto[];
}

/**
 * Global exception filter — renders every error as RFC-7807 problem+json.
 *
 * `DomainException` instances carry a stable `code` (the contract); generic
 * HttpExceptions are mapped to a generic `http.<status>` code so clients still
 * have *something* to switch on.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly baseUrl: string;

  constructor(
    private readonly sentry: SentryService,
    config: AppConfigService,
  ) {
    this.baseUrl = config.get('PUBLIC_BASE_URL');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest & { id?: string }>();
    const instance = req.id ? `${req.url} (req=${req.id})` : req.url;
    const problem = this.toProblem(exception, instance);

    if (problem.status >= 500) {
      this.logger.error(
        `[${req.method} ${req.url}] ${problem.status} ${problem.title} — ${problem.detail ?? ''}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      this.sentry.captureException(exception, { url: req.url, method: req.method });
    } else {
      this.logger.debug(
        `[${req.method} ${req.url}] ${problem.status} ${problem.title} (${problem.code})`,
      );
