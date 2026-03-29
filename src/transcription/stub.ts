import type { TranscriptionResult } from './types.js';

/** Dev / offline — no external API. */
export async function transcribeStub(): Promise<TranscriptionResult> {
  await new Promise((r) => setTimeout(r, 800));
  const text =
    '[Stub] Set TRANSCRIPTION_PROVIDER=assemblyai and ASSEMBLYAI_API_KEY for real transcription.';
  return {
    fullText: text,
    summary: 'Stub summary — replace with real ASR.',
    durationSeconds: 30,
    segments: [
      {
        seq: 0,
        startMs: 0,
        endMs: 30_000,
        text,
        speaker: null,
      },
    ],
  };
}
