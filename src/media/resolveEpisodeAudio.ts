import { readFile } from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { env } from '../env.js';

export async function resolveEpisodeAudio(episode: {
  audioLocalRelPath: string | null;
  audioUrl: string | null;
  audioMimeType: string | null;
}): Promise<{ buffer: Buffer; mime: string }> {
  if (episode.audioLocalRelPath) {
    const full = path.join(env.MEDIA_VAULT_PATH, episode.audioLocalRelPath);
    const buffer = await readFile(full);
    const mime = episode.audioMimeType ?? inferMimeFromPath(episode.audioLocalRelPath);
    return { buffer, mime };
  }

  if (episode.audioUrl?.trim().startsWith('http')) {
    const res = await axios.get(episode.audioUrl.trim(), {
      responseType: 'arraybuffer',
      maxContentLength: 512 * 1024 * 1024,
      maxBodyLength: 512 * 1024 * 1024,
      timeout: 600_000,
    });
    const ct = res.headers['content-type'];
    const mime =
      typeof ct === 'string' && ct.includes('/')
        ? ct.split(';')[0]!.trim()
        : 'audio/mpeg';
    return { buffer: Buffer.from(res.data), mime };
  }

  throw new Error('No audio source — upload a file or set an HTTPS audio URL.');
}

function inferMimeFromPath(rel: string): string {
  const lower = rel.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}
