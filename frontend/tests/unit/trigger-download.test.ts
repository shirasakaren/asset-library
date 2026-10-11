import { describe, expect, it, vi } from 'vitest';
import { downloadFileName, triggerDownload } from '@/lib/download/trigger-download';

describe('downloadFileName', () => {
  it.each([
    ['rock.fbx', 'rock.fbx'],
    ['Pack/Models/rock.fbx', 'rock.fbx'],
    ['Pack\\Models\\rock.fbx', 'rock.fbx'],
    ['/lead/slash.txt', 'slash.txt'],
    ['', 'download'],
    ['///', 'download'],
  ])('%s -> %s', (input, expected) => {
    expect(downloadFileName(input)).toBe(expected);
  });
});

describe('triggerDownload', () => {
  it('clicks a hidden anchor that carries the file name, then removes it', () => {
    const clicked: Array<{ href: string; download: string }> = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
      expect(document.body.contains(this)).toBe(true);
    });
    triggerDownload('blob:http://localhost/abc', 'dir/My Pack.unitypackage');
    expect(clicked).toEqual([
      { href: 'blob:http://localhost/abc', download: 'My Pack.unitypackage' },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
    spy.mockRestore();
  });
});
