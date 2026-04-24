import { Controller, ForbiddenException, Get, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { isIP } from 'node:net';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedRequestUser } from '../../infra/keycloak/keycloak-auth.guard';
import { AppConfigService } from '../../config/app-config.service';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint. Allowed when EITHER:
 *   - the request comes from one of METRICS_ALLOW_CIDRS, OR
 *   - the request carries an admin Keycloak token (we read `request.user`
 *     if a previous guard populated it — but we *never* require auth, since
 *     Prometheus scrapers don't carry bearer tokens).
 *
 * We declare the endpoint @Public() and do the allow-list check inline so
 * the global guard chain doesn't reject scraper traffic.
 */
@ApiTags('Admin')
@Controller()
export class MetricsController {
  private readonly cidrs: ParsedCidr[];

  constructor(
    private readonly metrics: MetricsService,
    config: AppConfigService,
  ) {
    this.cidrs = config
      .get('METRICS_ALLOW_CIDRS')
      .map(parseCidr)
      .filter((c): c is ParsedCidr => !!c);
  }

  @Public()
  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus text-format scrape endpoint.' })
  async metricsEndpoint(
    @Req() req: FastifyRequest & { user?: AuthenticatedRequestUser },
    @Res() res: FastifyReply,
  ): Promise<void> {
    const ip = req.ip;
    const allowedByCidr = this.cidrs.some((c) => ipInCidr(ip, c));
    const allowedByRole = !!req.user?.user.isAdmin;
    if (!allowedByCidr && !allowedByRole) {
      throw new ForbiddenException('Metrics are restricted to allow-listed scrapers or admins.');
    }
    const body = await this.metrics.render();
    void res.header('content-type', 'text/plain; version=0.0.4').send(body);
  }
}

interface ParsedCidr {
  family: 4 | 6;
  base: bigint;
  mask: bigint;
  bits: number;
}

function parseCidr(raw: string): ParsedCidr | null {
  const [ip, prefix] = raw.split('/');
  if (!ip) return null;
  const family = isIP(ip);
  if (family !== 4 && family !== 6) return null;
  const bits = Number(prefix ?? (family === 4 ? 32 : 128));
  if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) return null;
  const ipBig = ipToBigInt(ip, family);
  const width = family === 4 ? 32 : 128;
  const mask = ((1n << BigInt(width)) - 1n) ^ ((1n << BigInt(width - bits)) - 1n);
  return { family, base: ipBig & mask, mask, bits };
}

function ipToBigInt(ip: string, family: 4 | 6): bigint {
  if (family === 4) {
    return ip.split('.').reduce((acc, oct) => (acc << 8n) | BigInt(Number(oct)), 0n);
  }
  // Naïve v6 expansion — fine for the small allow-lists we expect.
  const groups = ip.split(':');
  const full = expandV6(groups);
  return full.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

function expandV6(groups: string[]): string[] {
  const idx = groups.indexOf('');
  if (idx === -1) return groups;
  const fill = Array(8 - (groups.length - 1)).fill('0');
  return [...groups.slice(0, idx), ...fill, ...groups.slice(idx + 1)];
}

function ipInCidr(ip: string, cidr: ParsedCidr): boolean {
  const family = isIP(ip);
  if (family !== cidr.family) return false;
  return (ipToBigInt(ip, family) & cidr.mask) === cidr.base;
}
