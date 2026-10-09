import { ApiError, type ProblemDetail } from '@/lib/api/errors';

export interface ErrorOpts {
  /** Overrides the default machine code (e.g. `asset.publish_blocked`) that the UI branches on. */
  code?: string;
  /** Field-level problems, in the real API's ProblemDetail shape. */
  fields?: ProblemDetail['fields'];
  /** Extra debugging payload, attached to the error instance as `extra`. */
  extra?: Record<string, unknown>;
}

function make(
  status: number,
  title: string,
  defaultCode: string,
  detail?: string,
  opts: ErrorOpts = {},
): ApiError {
  const err = new ApiError({
    type: 'about:blank',
    title,
    status,
    code: opts.code ?? defaultCode,
    detail,
    fields: opts.fields,
  });
  if (opts.extra) Object.assign(err, { extra: opts.extra });
  return err;
}

export function notFound(detail?: string, opts?: ErrorOpts): ApiError {
  return make(404, 'Not Found', 'http.not_found', detail, opts);
}

export function badRequest(detail: string, opts?: ErrorOpts): ApiError {
  return make(400, 'Bad Request', 'http.bad_request', detail, opts);
}

export function forbidden(detail?: string, opts?: ErrorOpts): ApiError {
  return make(403, 'Forbidden', 'http.forbidden', detail, opts);
}

export function conflict(detail: string, opts?: ErrorOpts): ApiError {
  return make(409, 'Conflict', 'http.conflict', detail, opts);
}

export function internalError(detail?: string, opts?: ErrorOpts): ApiError {
  return make(500, 'Internal Server Error', 'http.internal', detail, opts);
}
