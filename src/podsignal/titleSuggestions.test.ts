import { describe, expect, it } from 'vitest';
import {
  buildDeterministicTitleCandidatesForTest,
  generateEpisodeTitleSuggestions,
} from './titleSuggestions.js';

describe('titleSuggestions', () => {
  it('builds deterministic candidates from episode context', () => {
    const ranked = buildDeterministicTitleCandidatesForTest({
      title: 'How creators can grow podcast reach',
      summary: 'We break down audience growth, retention loops, and guest collaboration.',
      transcript:
        'Audience growth depends on consistency, retention, and distribution. We also discuss newsletter loops.',
      clipTitles: ['Retention loops that compound', 'Guest episodes that convert'],
      transcriptSegmentTexts: ['Audience growth starts with retention.', 'Newsletter distribution can lift return listens.'],
    });

    expect(ranked.length).toBeGreaterThanOrEqual(3);
    expect(ranked[0]!.label.length).toBeGreaterThan(10);
    expect(ranked[0]!.score).toBeGreaterThan(0);
    expect(
      ranked.slice(0, 5).some((r) => /how|why|mistakes|stop|playbook|:|\?|\|/i.test(r.label)),
    ).toBe(true);
  });

  it('falls back safely when title is blank', async () => {
    const out = await generateEpisodeTitleSuggestions(
      {
        title: '   ',
        summary: null,
        transcript: null,
        clipTitles: [],
        transcriptSegmentTexts: [],
      },
      { limit: 3, allowLlm: false },
    );

    expect(out.usedLlm).toBe(false);
    expect(out.suggestions).toHaveLength(3);
    expect(out.suggestions[0]!.label).toContain('Episode');
  });
});
