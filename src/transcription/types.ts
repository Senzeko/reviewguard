export interface TranscriptSegmentResult {
  seq: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
}

export interface TranscriptionResult {
  fullText: string;
  summary: string | null;
  durationSeconds: number | null;
  segments: TranscriptSegmentResult[];
}
