import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeValue } from './error-code';

/**
 * Per-field error inside a validation problem (`fields[]`).
 */
export class ProblemFieldDto {
  @ApiProperty({ example: 'translations[0].shortDescription' })
  path!: string;

  @ApiProperty({ example: 'required' })
  code!: string;

  @ApiProperty({ example: 'Short description is required.' })
  message!: string;
}

/**
 * RFC-7807 problem+json envelope returned by every 4xx/5xx response.
 * The `code` field is what programmatic clients switch on; `title`/`detail`
 * are for humans.
 */
export class ProblemDto {
  @ApiProperty({ example: 'https://asset-api.labmgm.org/errors/asset.not_found' })
  type!: string;

  @ApiProperty({ example: 'AssetNotFound' })
  title!: string;

  @ApiProperty({ example: 404 })
  status!: number;

  @ApiProperty({ example: 'Asset clxyz123 does not exist or has been deleted.' })
  detail?: string;

  @ApiProperty({ example: '/assets/clxyz123' })
  instance!: string;

  @ApiProperty({ example: 'asset.not_found' })
  code!: string;

  @ApiPropertyOptional({ type: [ProblemFieldDto] })
  fields?: ProblemFieldDto[];
}

/**
 * Thrown anywhere in services; caught by AllExceptionsFilter and rendered as
 * problem+json. Carrying the stable `code` separately from the HTTP status
 * lets us evolve messages without breaking clients.
 */
export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCodeValue,
    detail: string,
    public readonly fields?: ProblemFieldDto[],
  ) {
    super({ statusCode: status, code, message: detail, fields }, status);
  }
}

export class NotFoundDomainException extends DomainException {
  constructor(code: ErrorCodeValue, detail: string) {
    super(HttpStatus.NOT_FOUND, code, detail);
  }
}

export class ConflictDomainException extends DomainException {
  constructor(code: ErrorCodeValue, detail: string, fields?: ProblemFieldDto[]) {
    super(HttpStatus.CONFLICT, code, detail, fields);
  }
}

export class ForbiddenDomainException extends DomainException {
  constructor(code: ErrorCodeValue, detail: string) {
    super(HttpStatus.FORBIDDEN, code, detail);
  }
}

export class BadRequestDomainException extends DomainException {
  constructor(code: ErrorCodeValue, detail: string, fields?: ProblemFieldDto[]) {
    super(HttpStatus.BAD_REQUEST, code, detail, fields);
  }
}
