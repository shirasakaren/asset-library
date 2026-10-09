import { ApiError } from '@/lib/api/errors';

function make(status: number, title: string, code: string, detail?: string): ApiError {
  return new ApiError({ type: 'about:blank', title, status, code, detail });
}

export function notFound(detail?: string): ApiError {
  return make(404, 'Not Found', 'http.not_found', detail);
}

export function badRequest(detail: string): ApiError {
  return make(400, 'Bad Request', 'http.bad_request', detail);
}

export function forbidden(detail?: string): ApiError {
  return make(403, 'Forbidden', 'http.forbidden', detail);
}

export function internalError(detail?: string): ApiError {
  return make(500, 'Internal Server Error', 'http.internal', detail);
}
