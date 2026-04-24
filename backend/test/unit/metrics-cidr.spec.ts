/**
 * The metrics CIDR matcher is private to the controller; we re-derive it
 * here to keep the contract testable without booting Nest. The implementation
 * mirrors src/modules/metrics/metrics.controller.ts.
 */
import { isIP } from 'node:net';

interface ParsedCidr {
  family: 4 | 6;
  base: bigint;
  mask: bigint;
}

function parseCidr(raw: string): ParsedCidr | null {
  const [ip, prefix] = raw.split('/');
  if (!ip) return null;
  const family = isIP(ip);
  if (family !== 4 && family !== 6) return null;
  const width = family === 4 ? 32 : 128;
  const bits = Number(prefix ?? width);
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return null;
  const ipBig = ipToBigInt(ip, family);
  const mask = ((1n << BigInt(width)) - 1n) ^ ((1n << BigInt(width - bits)) - 1n);
  return { family, base: ipBig & mask, mask };
}

function ipToBigInt(ip: string, family: 4 | 6): bigint {
  if (family === 4) return ip.split('.').reduce((a, o) => (a << 8n) | BigInt(Number(o)), 0n);
  const groups = ip.split(':');
  const idx = groups.indexOf('');
  const fill = idx >= 0 ? Array(8 - (groups.length - 1)).fill('0') : [];
  const expanded = idx >= 0 ? [...groups.slice(0, idx), ...fill, ...groups.slice(idx + 1)] : groups;
  return expanded.reduce((a, g) => (a << 16n) | BigInt(parseInt(g, 16)), 0n);
}

function inCidr(ip: string, cidr: ParsedCidr): boolean {
  const family = isIP(ip);
  if (family !== cidr.family) return false;
  return (ipToBigInt(ip, family) & cidr.mask) === cidr.base;
}

describe('metrics CIDR matcher', () => {
  it('matches a /24', () => {
    const cidr = parseCidr('10.0.0.0/24')!;
    expect(inCidr('10.0.0.42', cidr)).toBe(true);
    expect(inCidr('10.0.1.42', cidr)).toBe(false);
  });

  it('matches a /32 (single host)', () => {
    const cidr = parseCidr('10.0.0.1/32')!;
    expect(inCidr('10.0.0.1', cidr)).toBe(true);
    expect(inCidr('10.0.0.2', cidr)).toBe(false);
  });

  it('rejects nonsense inputs', () => {
    expect(parseCidr('not.a.cidr/16')).toBeNull();
    expect(parseCidr('10.0.0.0/99')).toBeNull();
  });
});
