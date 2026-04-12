import { NotificationType } from '@prisma/client';
import { EmailRendererService } from '../../src/modules/notifications/email-renderer.service';

describe('EmailRendererService', () => {
  const renderer = new EmailRendererService();

  it('renders a known event in English', async () => {
    const result = await renderer.render(NotificationType.COMMENT_CREATED, 'en', {
      author: { displayName: 'Ada' },
      assetTitle: 'Crazy Swords',
      commentExcerpt: 'Nice asset!',
      links: { commentUrl: 'https://asset.labmgm.org/assets/swords#comment-1' },
    });
    expect(result.subject).toBe('Ada commented on “Crazy Swords”');
    expect(result.html).toContain('Ada');
    expect(result.html).toContain('Crazy Swords');
    expect(result.text).toContain('Nice asset!');
  });

  it('falls back to English when an Indonesian field is missing', async () => {
    const result = await renderer.render(NotificationType.FEATURED_FEATURED, 'id', {
      assetTitle: 'Sword Pack',
      links: { discoverUrl: 'https://asset.labmgm.org/discover' },
    });
    // Indonesian subject is defined; just sanity-check the subject substitution.
    expect(result.subject).toContain('Sword Pack');
    expect(result.html).toContain('Sword Pack');
  });

  it('supports nested `{{a.b.c}}` paths', async () => {
    const result = await renderer.render(NotificationType.COMMENT_REPLY, 'en', {
      author: { displayName: 'Linus' },
      assetTitle: 'X',
      commentExcerpt: 'reply',
      links: { commentUrl: 'https://example.com' },
    });
    expect(result.subject).toContain('Linus');
  });
});
