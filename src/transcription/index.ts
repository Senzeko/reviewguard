/**
 * Transcription entry — selects provider from env.
 */

import { env } from '../env.js';
import { transcribeStub } from './stub.js';
import { transcribeWithAssemblyAI } from './assemblyai.js';
import type { TranscriptionResult } from './types.js';

export type { TranscriptionResult, TranscriptSegmentResult } from './types.js';

export async function runTranscription(
  buffer: Buffer,
  mimeType: string,
): Promise<TranscriptionResult> {
  if (env.TRANSCRIPTION_PROVIDER === 'stub') {
    return transcribeStub();
  }

  if (env.TRANSCRIPTION_PROVIDER === 'assemblyai') {
    if (!env.ASSEMBLYAI_API_KEY) {
      throw new Error(
        'ASSEMBLYAI_API_KEY is required when TRANSCRIPTION_PROVIDER=assemblyai',
      );
    }
    return transcribeWithAssemblyAI(env.ASSEMBLYAI_API_KEY, buffer, mimeType);
  }

  throw new Error(`Unknown TRANSCRIPTION_PROVIDER: ${env.TRANSCRIPTION_PROVIDER}`);
}
