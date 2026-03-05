export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  fields?: Array<{ path: string; code: string; message: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly instance?: string;
  readonly fields?: ProblemDetail['fields'];
  readonly requestId?: string;

  constructor(problem: ProblemDetail, requestId?: string) {
    super(problem.detail || problem.title || `HTTP ${problem.status}`);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.instance = problem.instance;
    this.fields = problem.fields;
    this.requestId = requestId;
  }

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }
}
