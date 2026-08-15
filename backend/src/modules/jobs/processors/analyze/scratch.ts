import { GetObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { S3Service } from '../../../../infra/s3/s3.service';

/**
 * One scratch dir per job. Streams the S3 object to disk so subprocesses
 * (Blender, pyassimp, ffprobe) can mmap it without us holding the whole file
 * in memory. The caller is responsible for cleanup — `using` style:
 *
 *   const scratch = await openScratch(s3, role, key, jobId);
 *   try { ... } finally { await scratch.cleanup(); }
 */
export interface Scratch {
  dir: string;
  filePath: string;
  cleanup: () => Promise<void>;
}

export async function openScratch(
  s3: S3Service,
  bucketRole: 'assets' | 'thumbs' | 'editor',
  key: string,
  jobId: string,
  rootDir: string,
): Promise<Scratch> {
  const dir = join(rootDir, jobId);
  const filePath = join(dir, basename(key));
  await mkdir(dirname(filePath), { recursive: true });
  const out = await s3.client.send(
    new GetObjectCommand({ Bucket: s3.bucketFor(bucketRole), Key: key }),
  );
  if (!out.Body) throw new Error(`S3 returned no body for ${key}`);
  const readable = out.Body as Readable;
  await pipeline(readable, createWriteStream(filePath));
  return {
    dir,
    filePath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

function basename(key: string): string {
  const slash = key.lastIndexOf('/');
  return slash === -1 ? key : key.slice(slash + 1);
}
