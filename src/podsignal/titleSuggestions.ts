/**
 * Episode title suggestions with deterministic scoring, optional LLM candidate
 * generation, and optional LLM reranking.
 * Never throws from the public API; falls back to heuristic ordering.
 */

export interface EpisodeTitleSuggestionInput {
  title: string;
  summary: string | null;
  transcript: string | null;
  clipTitles: string[];
  transcriptSegmentTexts: string[];
}

export type EpisodeTitleTonePreset =
  | 'balanced'
  | 'authority'
  | 'curiosity'
  | 'contrarian'
  | 'practical';

export type EpisodeTitleNichePreset =
  | 'general'
  | 'b2b'
  | 'creator-economy'
  | 'wellness'
  | 'finance'
  | 'tech'
  | 'media';

export interface EpisodeTitleSuggestion {
  label: string;
  score: number;
  reason: string;
}

export interface EpisodeTitleSuggestionResult {
  suggestions: EpisodeTitleSuggestion[];
  usedLlm: boolean;
  generatedAt: string;
}

const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'we', 'what', 'when', 'where', 'with', 'you',
  'your', 'our', 'about', 'after', 'before', 'during', 'episode', 'podcast', 'interview',
]);

const MAX_TITLE_LEN = 70;
const TARGET_TITLE_LEN = 58;

let _client: unknown = null;

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function trimToLength(input: string, max = MAX_TITLE_LEN): string {
  const s = normalizeText(input);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const noHalfWord = cut.replace(/\s+\S*$/, '').trim();
  return `${(noHalfWord || cut).trim()}...`;
}

function sanitizeCandidate(input: string): string {
  // Keep punctuation that helps title structure, strip noisy wrappers.
  return normalizeText(input.replace(/^["'`]+|["'`]+$/g, ''));
}

function extractTopTerms(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  for (const w of words) {
    const cleaned = w.replace(/^'+|'+$/g, '');
    if (cleaned.length < 4) continue;
    if (TITLE_STOP_WORDS.has(cleaned)) continue;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .slice(0, limit)
    .map(([term]) => term);
}

function chooseTopicPhrase(terms: string[]): string | null {
  const first = terms[0];
  if (!first) return null;
  if (terms.length === 1) return toTitleCase(first);
  const second = terms[1];
  if (!first || !second) return first ? toTitleCase(first) : null;
  return toTitleCase(`${first} ${second}`);
}

function buildContext(input: EpisodeTitleSuggestionInput): string {
  const pieces = [
    input.summary ?? '',
    input.clipTitles.slice(0, 8).join(' '),
    input.transcriptSegmentTexts.slice(0, 120).join(' '),
    (input.transcript ?? '').slice(0, 9000),
  ];
  return normalizeText(pieces.join(' '));
}

function tonePresetHint(preset: EpisodeTitleTonePreset): string {
  switch (preset) {
    case 'authority':
      return 'prioritize expert framing, proven systems, and credible specificity';
    case 'curiosity':
      return 'prioritize curiosity gaps, surprising findings, and high-intrigue hooks';
    case 'contrarian':
      return 'prioritize respectful challenge to common assumptions and myth-busting angles';
    case 'practical':
      return 'prioritize tactical steps, templates, checklists, and immediate actionability';
    default:
      return 'balance curiosity, specificity, and practical value';
  }
}

function nichePresetHint(preset: EpisodeTitleNichePreset): string {
  switch (preset) {
    case 'b2b':
      return 'optimize for pipeline, buyers, revenue operations, and GTM clarity';
    case 'creator-economy':
      return 'optimize for audience growth, content systems, and monetization';
    case 'wellness':
      return 'optimize for habit change, health outcomes, and sustainable routines';
    case 'finance':
      return 'optimize for risk/reward framing, cash flow, and practical money decisions';
    case 'tech':
      return 'optimize for product, engineering trade-offs, and adoption outcomes';
    case 'media':
      return 'optimize for storytelling angles, distribution leverage, and audience attention';
    default:
      return 'keep broad and widely relevant to general podcast audiences';
  }
}

function buildRawCandidates(
  input: EpisodeTitleSuggestionInput,
  topTerms: string[],
  preset: EpisodeTitleTonePreset,
  nichePreset: EpisodeTitleNichePreset,
): string[] {
  const baseTitle = normalizeText(input.title);
  const topicPhrase = chooseTopicPhrase(topTerms);
  const firstClip = normalizeText(input.clipTitles[0] ?? '');
  const secondTopic = topTerms[2] ? toTitleCase(topTerms[2]) : null;
  const thirdTopic = topTerms[3] ? toTitleCase(topTerms[3]) : null;
  const altTopic = topTerms[4] ? toTitleCase(topTerms[4]) : null;
  const primaryTopic = topTerms[0] ? toTitleCase(topTerms[0]) : null;

  const common = [
    baseTitle,
    topicPhrase ? `${baseTitle} | ${topicPhrase}` : `${baseTitle} | Key moments`,
    topicPhrase ? `How ${topicPhrase} actually works (${baseTitle})` : `What this episode gets right: ${baseTitle}`,
    firstClip ? `${firstClip} - from ${baseTitle}` : `${baseTitle} - Highlights and takeaways`,
    topicPhrase ? `${topicPhrase}: ${baseTitle}` : `${baseTitle} - Deep dive`,
    secondTopic ? `${secondTopic} insights from ${baseTitle}` : `${baseTitle} - Practical insights`,
    topicPhrase ? `${baseTitle}: ${topicPhrase} breakdown` : `${baseTitle}: Full breakdown`,
    topicPhrase ? `The real story on ${topicPhrase} (${baseTitle})` : `${baseTitle} - What matters most`,
    topicPhrase ? `${topicPhrase}: What most people miss` : `${baseTitle}: What most people miss`,
    topicPhrase ? `${topicPhrase} playbook: wins, mistakes, fixes` : `${baseTitle}: wins, mistakes, fixes`,
    thirdTopic ? `${thirdTopic} mistakes that kill momentum` : `${baseTitle}: mistakes to avoid`,
    secondTopic ? `Stop guessing: ${secondTopic} that actually works` : `Stop guessing: what actually works`,
    altTopic ? `${altTopic} in 2026: what's changing now` : `${baseTitle}: what's changing now`,
    firstClip ? `${firstClip} (and why it matters)` : `${baseTitle}: one shift that changes everything`,
  ];

  const toneSpecific =
    preset === 'authority'
      ? [
          topicPhrase ? `${topicPhrase} framework trusted by top operators` : `${baseTitle}: the framework that works`,
          primaryTopic ? `${primaryTopic}: expert playbook for reliable results` : `${baseTitle}: expert playbook`,
          `${baseTitle}: proven tactics that hold up under pressure`,
        ]
      : preset === 'curiosity'
        ? [
            topicPhrase ? `Nobody tells you this about ${topicPhrase}` : `${baseTitle}: what most people overlook`,
            firstClip ? `${firstClip}: the surprising part` : `${baseTitle}: the surprising part`,
            `${baseTitle}: the counterintuitive lesson that changes the game`,
          ]
        : preset === 'contrarian'
          ? [
              topicPhrase ? `Everything you've heard about ${topicPhrase} is incomplete` : `${baseTitle}: what people get wrong`,
              primaryTopic ? `The ${primaryTopic} myth that costs real growth` : `${baseTitle}: the myth that costs growth`,
              `${baseTitle}: stop following outdated advice`,
            ]
          : preset === 'practical'
            ? [
                topicPhrase ? `${topicPhrase} checklist: do this next` : `${baseTitle}: your next-step checklist`,
                primaryTopic ? `${primaryTopic} step-by-step for busy teams` : `${baseTitle}: step-by-step execution`,
                `${baseTitle}: scripts, examples, and exact actions`,
              ]
            : [];

  const nicheSpecific =
    nichePreset === 'b2b'
      ? [
          `${baseTitle}: pipeline lessons that actually convert`,
          topicPhrase ? `${topicPhrase} for B2B teams: from strategy to revenue` : `${baseTitle}: B2B strategy to revenue`,
          `${baseTitle}: what buyers care about now`,
        ]
      : nichePreset === 'creator-economy'
        ? [
            `${baseTitle}: audience growth playbook for creators`,
            topicPhrase ? `${topicPhrase}: creator monetization that compounds` : `${baseTitle}: creator monetization that compounds`,
            `${baseTitle}: content systems that scale`,
          ]
        : nichePreset === 'wellness'
          ? [
              `${baseTitle}: habits that improve consistency`,
              topicPhrase ? `${topicPhrase}: science-backed wellness habits` : `${baseTitle}: practical wellness habits`,
              `${baseTitle}: what actually works long-term`,
            ]
          : nichePreset === 'finance'
            ? [
                `${baseTitle}: smarter money moves this year`,
                topicPhrase ? `${topicPhrase}: risk, return, and real trade-offs` : `${baseTitle}: risk, return, and trade-offs`,
                `${baseTitle}: decisions that protect cash flow`,
              ]
            : nichePreset === 'tech'
              ? [
                  `${baseTitle}: product and engineering trade-offs explained`,
                  topicPhrase ? `${topicPhrase}: from idea to shipped outcome` : `${baseTitle}: from idea to shipped outcome`,
                  `${baseTitle}: what technical teams should do next`,
                ]
              : nichePreset === 'media'
                ? [
                    `${baseTitle}: storytelling that holds attention`,
                    topicPhrase ? `${topicPhrase}: media distribution that drives reach` : `${baseTitle}: media distribution that drives reach`,
                    `${baseTitle}: formats that audiences share`,
                  ]
                : [];

  return [...common, ...toneSpecific, ...nicheSpecific];
}

function dedupeCandidates(candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const trimmed = trimToLength(c);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function scoreDeterministicCandidates(
  candidates: string[],
  topTerms: string[],
  preset: EpisodeTitleTonePreset,
  nichePreset: EpisodeTitleNichePreset,
): EpisodeTitleSuggestion[] {
  const presetRegex =
    preset === 'authority'
      ? /(framework|proven|expert|playbook|trusted|system)/i
      : preset === 'curiosity'
        ? /(nobody|surprising|secret|what most|unexpected|counterintuitive|why)/i
        : preset === 'contrarian'
          ? /(myth|wrong|stop|outdated|truth|actually|misconception)/i
          : preset === 'practical'
            ? /(checklist|step-by-step|template|scripts|actions|playbook|guide)/i
            : /(how|why|stop|mistakes|playbook|works|changing|matters)/i;
  const nicheRegex =
    nichePreset === 'b2b'
      ? /(pipeline|revenue|buyers|gtm|sales|demand)/i
      : nichePreset === 'creator-economy'
        ? /(creator|audience|content|monetization|subscriber|growth)/i
        : nichePreset === 'wellness'
          ? /(wellness|habit|health|sleep|stress|recovery)/i
          : nichePreset === 'finance'
            ? /(finance|money|cash|invest|risk|return|budget)/i
            : nichePreset === 'tech'
              ? /(tech|product|engineering|ai|stack|shipped|adoption)/i
              : nichePreset === 'media'
                ? /(media|storytelling|distribution|attention|format|audience)/i
                : null;

  return candidates
    .map((candidate) => {
      const normalized = candidate.toLowerCase();
      const lenDelta = Math.abs(candidate.length - TARGET_TITLE_LEN);
      const lenScore = Math.max(0, 1 - lenDelta / TARGET_TITLE_LEN);
      const keywordHits = topTerms.reduce((acc, term) => (normalized.includes(term) ? acc + 1 : acc), 0);
      const keywordScore = Math.min(0.45, keywordHits * 0.15);
      const structureBonus = /[:|?]/.test(candidate) ? 0.08 : 0;
      const toneBonus = presetRegex.test(candidate) ? 0.07 : 0;
      const nicheBonus = nicheRegex && nicheRegex.test(candidate) ? 0.05 : 0;
      const score = Number((lenScore + keywordScore + structureBonus + toneBonus + nicheBonus).toFixed(4));
      return {
        label: candidate,
        score,
        reason: `Heuristic score: length-fit + keyword overlap (${keywordHits}) + ${preset} tone + ${nichePreset} niche`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function getClient(): Promise<InstanceType<typeof import('@anthropic-ai/sdk').default>> {
  if (!_client) {
    const { env } = await import('../env.js');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client as InstanceType<typeof import('@anthropic-ai/sdk').default>;
}

async function rerankWithLlm(
  input: EpisodeTitleSuggestionInput,
  scored: EpisodeTitleSuggestion[],
  tonePreset: EpisodeTitleTonePreset,
  nichePreset: EpisodeTitleNichePreset,
): Promise<EpisodeTitleSuggestion[] | null> {
  const candidates = scored.map((s) => s.label);
  if (candidates.length <= 1) return scored;

  const system = [
    'You are a podcast YouTube title ranker.',
    'Pick the best titles for click clarity without clickbait.',
    'Use transcript and summary relevance, specificity, and readability.',
    `Tone preference: ${tonePreset} (${tonePresetHint(tonePreset)}).`,
    `Niche preference: ${nichePreset} (${nichePresetHint(nichePreset)}).`,
    'Return only JSON matching this schema:',
    '{"ranked":[{"title":"string","score":0-1,"reason":"string"}]}',
    'Only use provided candidate titles. No new titles.',
  ].join(' ');

  const userContent = JSON.stringify({
    episodeTitle: input.title,
    summary: input.summary ?? '',
    clipTitles: input.clipTitles.slice(0, 8),
    transcriptExcerpt: (input.transcript ?? '').slice(0, 6000),
    candidates,
  });

  try {
    const client = await getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    const block = message.content[0];
    const raw = block && block.type === 'text' ? block.text : '';
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    const ranked = (parsed as { ranked?: Array<{ title?: string; score?: number; reason?: string }> })?.ranked;
    if (!Array.isArray(ranked)) return null;

    const scoreByLabel = new Map(scored.map((s) => [s.label, s]));
    const out: EpisodeTitleSuggestion[] = [];
    for (const row of ranked) {
      const label = typeof row.title === 'string' ? row.title : '';
      if (!label || !scoreByLabel.has(label)) continue;
      const score =
        typeof row.score === 'number' && Number.isFinite(row.score)
          ? Math.max(0, Math.min(1, row.score))
          : scoreByLabel.get(label)!.score;
      const reason =
        typeof row.reason === 'string' && row.reason.trim().length > 0
          ? row.reason.trim()
          : 'LLM-ranked';
      out.push({ label, score: Number(score.toFixed(4)), reason });
    }
    if (!out.length) return null;

    const missing = scored.filter((s) => !out.some((o) => o.label === s.label));
    return [...out, ...missing];
  } catch {
    return null;
  }
}

async function generateCandidatesWithLlm(
  input: EpisodeTitleSuggestionInput,
  seeded: string[],
  tonePreset: EpisodeTitleTonePreset,
  nichePreset: EpisodeTitleNichePreset,
): Promise<string[] | null> {
  const system = [
    'You write high-performing YouTube titles for podcast clips/episodes.',
    'Goal: maximize curiosity and clicks WITHOUT clickbait or false claims.',
    `Tone preference: ${tonePreset} (${tonePresetHint(tonePreset)}).`,
    `Niche preference: ${nichePreset} (${nichePresetHint(nichePreset)}).`,
    `Return ONLY JSON: {"candidates":["title1","title2",...]} with 8-14 items.`,
    `Rules: each title <= ${MAX_TITLE_LEN} chars, specific, concrete, readable, no emojis.`,
    'Use strong hooks (why/how/mistakes/framework/what changed), keep truthful to supplied content.',
    'Avoid generic labels like "Highlights and takeaways".',
  ].join(' ');

  const userContent = JSON.stringify({
    episodeTitle: input.title,
    summary: input.summary ?? '',
    clipTitles: input.clipTitles.slice(0, 10),
    transcriptExcerpt: (input.transcript ?? '').slice(0, 7000),
    transcriptSegments: input.transcriptSegmentTexts.slice(0, 60),
    seededCandidates: seeded.slice(0, 10),
  });

  try {
    const client = await getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 900,
      temperature: 0.35,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    const block = message.content[0];
    const raw = block && block.type === 'text' ? block.text : '';
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    const arr = (parsed as { candidates?: unknown[] })?.candidates;
    if (!Array.isArray(arr)) return null;
    const cleaned = arr
      .filter((x): x is string => typeof x === 'string')
      .map((s) => trimToLength(sanitizeCandidate(s)))
      .filter((s) => s.length > 0);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

export async function generateEpisodeTitleSuggestions(
  input: EpisodeTitleSuggestionInput,
  opts?: {
    limit?: number;
    allowLlm?: boolean;
    tonePreset?: EpisodeTitleTonePreset;
    nichePreset?: EpisodeTitleNichePreset;
  },
): Promise<EpisodeTitleSuggestionResult> {
  const limit = Math.min(8, Math.max(1, opts?.limit ?? 3));
  const tonePreset = opts?.tonePreset ?? 'balanced';
  const nichePreset = opts?.nichePreset ?? 'general';
  const baseTitle = normalizeText(input.title);
  if (!baseTitle) {
    return {
      suggestions: [
        { label: 'Episode title', score: 0.5, reason: 'Fallback title' },
        { label: 'Episode highlights', score: 0.49, reason: 'Fallback title' },
        { label: 'Best moments from this episode', score: 0.48, reason: 'Fallback title' },
      ].slice(0, limit),
      usedLlm: false,
      generatedAt: new Date().toISOString(),
    };
  }

  const context = buildContext(input);
  const topTerms = extractTopTerms(context, 8);
  const seeded = dedupeCandidates(buildRawCandidates(input, topTerms, tonePreset, nichePreset));

  let candidatePool = seeded;
  let usedLlm = false;
  if (opts?.allowLlm !== false) {
    const llmCandidates = await generateCandidatesWithLlm(input, seeded, tonePreset, nichePreset);
    if (llmCandidates && llmCandidates.length > 0) {
      candidatePool = dedupeCandidates([...llmCandidates, ...seeded]);
      usedLlm = true;
    }
  }

  const deterministic = scoreDeterministicCandidates(candidatePool, topTerms, tonePreset, nichePreset);

  let ranked = deterministic;
  if (opts?.allowLlm !== false) {
    const llmRanked = await rerankWithLlm(input, deterministic, tonePreset, nichePreset);
    if (llmRanked) {
      ranked = llmRanked;
      usedLlm = true;
    }
  }

  return {
    suggestions: ranked.slice(0, limit),
    usedLlm,
    generatedAt: new Date().toISOString(),
  };
}

export function buildDeterministicTitleCandidatesForTest(
  input: EpisodeTitleSuggestionInput,
  tonePreset: EpisodeTitleTonePreset = 'balanced',
  nichePreset: EpisodeTitleNichePreset = 'general',
): EpisodeTitleSuggestion[] {
  const context = buildContext(input);
  const topTerms = extractTopTerms(context, 8);
  const unique = dedupeCandidates(buildRawCandidates(input, topTerms, tonePreset, nichePreset));
  return scoreDeterministicCandidates(unique, topTerms, tonePreset, nichePreset);
}
