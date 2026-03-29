/**
 * AssemblyAI REST API — upload bytes, poll until completed, map utterances to segments.
 */

import type { TranscriptionResult, TranscriptSegmentResult } from './types.js';

interface AssemblyTranscript {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  error?: string;
  audio_duration?: number | null;
  utterances?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
}

const MAX_POLL_MS = 25 * 60_000;
const POLL_INTERVAL_MS = 1500;

export async function transcribeWithAssemblyAI(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<TranscriptionResult> {
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': mimeType || 'application/octet-stream',
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`AssemblyAI upload failed (${uploadRes.status}): ${errText.slice(0, 500)}`);
  }

  const { upload_url } = (await uploadRes.json()) as { upload_url: string };

  const createRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: upload_url,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`AssemblyAI transcript create failed (${createRes.status}): ${errText.slice(0, 500)}`);
  }

  const { id } = (await createRes.json()) as { id: string };

  const deadline = Date.now() + MAX_POLL_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: apiKey },
    });

    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`AssemblyAI poll failed (${pollRes.status}): ${errText.slice(0, 500)}`);
    }

    const tr = (await pollRes.json()) as AssemblyTranscript;

    if (tr.status === 'error') {
      throw new Error(tr.error ?? 'AssemblyAI transcription error');
    }

    if (tr.status === 'completed') {
      return mapCompleted(tr);
    }
  }

  throw new Error('AssemblyAI transcription timed out');
}

function mapCompleted(tr: AssemblyTranscript): TranscriptionResult {
  const fullText = (tr.text ?? '').trim();
  const durationSeconds =
    tr.audio_duration != null && Number.isFinite(tr.audio_duration)
      ? Math.round(tr.audio_duration)
      : null;

  let segments: TranscriptSegmentResult[];

  if (tr.utterances && tr.utterances.length > 0) {
    segments = tr.utterances.map((u, i) => ({
      seq: i,
      startMs: Math.max(0, Math.round(u.start)),
      endMs: Math.max(0, Math.round(u.end)),
      text: u.text.trim(),
      speaker: u.speaker ?? null,
    }));
  } else if (fullText) {
    const endMs =
      durationSeconds != null ? durationSeconds * 1000 : 60_000;
    segments = [
      {
        seq: 0,
        startMs: 0,
        endMs,
        text: fullText,
        speaker: null,
      },
    ];
  } else {
    throw new Error('AssemblyAI returned empty transcript');
  }

  const summary =
    fullText.length > 400 ? `${fullText.slice(0, 397)}…` : fullText || null;

  return {
    fullText,
    summary,
    durationSeconds,
    segments,
  };
}
