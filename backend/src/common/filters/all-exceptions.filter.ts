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
    }

    void res.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemPayload {
    if (exception instanceof DomainException) {
      const body = exception.getResponse() as { message?: string };
      return {
        type: `${this.baseUrl}/errors/${exception.code}`,
        title: exception.constructor.name.replace(/Exception$/, ''),
        status: exception.getStatus(),
        detail: body.message ?? exception.message,
        instance,
        code: exception.code,
        fields: exception.fields,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const { detail, fields } = this.normalizeHttp(response);
      const code = `http.${status}`;
      return {
        type: `${this.baseUrl}/errors/${code}`,
        title: exception.name,
        status,
        detail,
        instance,
        code,
        fields,
      };
    }

    return {
      type: `${this.baseUrl}/errors/http.500`,
      title: 'InternalServerError',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: exception instanceof Error ? exception.message : 'Unknown error',
      instance,
      code: 'http.500',
    };
  }

  private normalizeHttp(response: string | object): {
    detail?: string;
    fields?: ProblemFieldDto[];
  } {
    if (typeof response === 'string') return { detail: response };
    const { message, fields } = response as {
      message?: string | string[];
      fields?: ProblemFieldDto[];
    };
    return {
      detail: Array.isArray(message) ? message.join('; ') : message,
      fields,
    };
  }
}
