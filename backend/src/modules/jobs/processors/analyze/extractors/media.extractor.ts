import { runSubprocess } from '../subprocess';

export interface AudioMeta {
  durationSec: number;
  sampleRate: number;
  channels: number;
  bitrateKbps?: number;
}

export interface VideoMeta {
  durationSec: number;
  width: number;
  height: number;
  codec: string;
  bitrateKbps?: number;
  hasAudio: boolean;
}

/**
 * ffprobe-based audio/video probe. We parse the JSON output (`-show_streams`)
 * for the first audio/video stream — assets with multiple streams are rare
 * and the analyzer treats them as opaque.
 */
export async function extractAudio(
  filePath: string,
  ffprobeBin: string,
  timeoutMs: number,
): Promise<AudioMeta | null> {
  const probe = await runFfprobe(filePath, ffprobeBin, timeoutMs);
  if (!probe) return null;
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  if (!audio) return null;
  return {
    durationSec: Number(probe.format.duration ?? audio.duration ?? 0),
    sampleRate: Number(audio.sample_rate ?? 0),
    channels: Number(audio.channels ?? 0),
    bitrateKbps: probe.format.bit_rate
      ? Math.round(Number(probe.format.bit_rate) / 1000)
      : undefined,
  };
}

export async function extractVideo(
  filePath: string,
  ffprobeBin: string,
  timeoutMs: number,
): Promise<VideoMeta | null> {
  const probe = await runFfprobe(filePath, ffprobeBin, timeoutMs);
  if (!probe) return null;
  const video = probe.streams.find((s) => s.codec_type === 'video');
  if (!video) return null;
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  return {
    durationSec: Number(probe.format.duration ?? video.duration ?? 0),
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    codec: String(video.codec_name ?? 'unknown'),
    bitrateKbps: probe.format.bit_rate
