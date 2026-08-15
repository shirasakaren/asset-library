import { describe, it, expect } from 'vitest';
import { formatBytes, formatNumber, formatDate } from '@/lib/format';

describe('formatBytes', () => {
  it('handles bytes / KB / MB / GB', () => {
    expect(formatBytes(512)).toContain('B');
    expect(formatBytes(2048)).toContain('KB');
    expect(formatBytes(1024 * 1024 * 5)).toContain('MB');
    expect(formatBytes(1024 ** 3 * 2)).toContain('GB');
  });
  it('returns em-dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('formats in en-US by default', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
  it('formats in id-ID with dot separators', () => {
    expect(formatNumber(1234567, 'id')).toBe('1.234.567');
  });
});

describe('formatDate', () => {
  it('formats with medium date style', () => {
    const out = formatDate('2026-01-15T00:00:00Z', 'en');
    expect(out).toMatch(/2026/);
  });
});
