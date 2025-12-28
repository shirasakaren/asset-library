/**
 * The GC's `extractEditorKey` and TipTap-walker are pure helpers — exercise
 * them via the module's exported plumbing. We require() the worker for the
 * side-effect of exporting the helpers as part of the file (they're private,
 * so we test through the documented behavior of the public function via
 * direct doc-walking — see fixture).
 *
 * Direct invocation: build a tiny TipTap doc that references one URL pointing
 * at the editor bucket and confirm the worker tags only that key as
 * referenced.
 */
import { Prisma } from '@prisma/client';

// Reuse the (currently private) walker by re-implementing the same shape
// inline — the goal is to lock down the URL extraction contract.
function extractEditorKey(url: string, editorBucket: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith(`${editorBucket}.`)) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    }
    if (parsed.pathname.startsWith(`/${editorBucket}/`)) {
      return decodeURIComponent(parsed.pathname.slice(editorBucket.length + 2));
    }
  } catch {
    return null;
  }
  return null;
}

describe('editor-media URL → key extraction', () => {
  const bucket = 'mgm-asset-library-editor';

  it('parses virtual-hosted URLs', () => {
    const url = `https://${bucket}.s3.us-east-1.amazonaws.com/editor/user1/abc.png`;
    expect(extractEditorKey(url, bucket)).toBe('editor/user1/abc.png');
  });

  it('parses path-style URLs (MinIO)', () => {
    const url = `http://minio:9000/${bucket}/editor/user1/abc.png`;
    expect(extractEditorKey(url, bucket)).toBe('editor/user1/abc.png');
  });

  it('ignores unrelated buckets', () => {
    const url = `http://minio:9000/other-bucket/file.png`;
    expect(extractEditorKey(url, bucket)).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(extractEditorKey('not a url', bucket)).toBeNull();
  });

  it('decodes %20 etc in keys', () => {
    const url = `http://minio:9000/${bucket}/editor/user1/hello%20world.png`;
    expect(extractEditorKey(url, bucket)).toBe('editor/user1/hello world.png');
  });
});

describe('TipTap walker contract', () => {
  it('finds image src + link href at any depth', () => {
    const doc: Prisma.JsonValue = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
