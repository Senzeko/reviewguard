import type { TranscriptionResult } from './types.js';

/**
 * Dev / offline — no external API.
 * Does not transcribe your file; avoids implying a fake duration (older stub used 30s).
 */
export async function transcribeStub(): Promise<TranscriptionResult> {
  await new Promise((r) => setTimeout(r, 800));
  const text =
    '[Stub] TRANSCRIPTION_PROVIDER=stub does not run real speech-to-text. Your full file is still stored; set TRANSCRIPTION_PROVIDER=assemblyai and ASSEMBLYAI_API_KEY (e.g. in Railway variables) to transcribe the entire recording.';
  return {
    fullText: text,
    summary: 'Stub mode — add AssemblyAI for full-length transcription.',
    durationSeconds: null,
    segments: [],
  };
}
