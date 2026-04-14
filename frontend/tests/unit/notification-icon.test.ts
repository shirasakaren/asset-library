import { describe, it, expect } from 'vitest';
import { notificationLink } from '@/components/notifications/notification-icon';

describe('notificationLink', () => {
  it('routes comment notifications to the asset thread', () => {
    expect(
      notificationLink('COMMENT_CREATED', { assetSlug: 'demo', commentId: 'c1' }),
    ).toBe('/assets/demo#comment-c1');
  });

  it('routes version.published to the asset page', () => {
    expect(notificationLink('VERSION_PUBLISHED', { assetSlug: 'demo', semver: '1.2.3' })).toBe(
      '/assets/demo',
    );
  });

  it('routes analyzer.failed to the publish wizard for that asset', () => {
    expect(notificationLink('ANALYZER_FAILED', { assetId: 'asset-1' })).toBe('/publish/asset-1');
  });

  it('falls back to /notifications when payload is missing required fields', () => {
    expect(notificationLink('UNKNOWN_TYPE', {})).toBe('/notifications');
  });
});
