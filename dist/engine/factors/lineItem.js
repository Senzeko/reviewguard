/**
 * src/engine/factors/lineItem.ts
 *
 * LLM-based entity extraction from review text + item comparison against POS line items.
 */
// ── LLM client (lazy init — deferred to avoid eagerly importing env.ts) ─────
let _client = null;
async function getClient() {
    if (!_client) {
        const { env } = await import('../../env.js');
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    return _client;
}
// ── LLM prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a product entity extractor. Given a customer review, return ONLY a JSON array of specific product or service names mentioned. Do not include adjectives, sentiment, or general terms. Return [] if no specific items are mentioned. Return only the JSON array with no other text, explanation, or markdown formatting.

Example input: "The fish tacos were incredible and the house margarita was strong!"
Example output: ["Fish Tacos", "House Margarita"]

Example input: "Great service and amazing food overall"
Example output: []`;
/**
 * Calls claude-sonnet-4-6 to extract product entity names from a review.
 * Never throws — returns [] on any failure.
 */
async function extractProductEntities(reviewText) {
    let rawResponse = '';
    try {
        const client = await getClient();
        const message = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 256,
            temperature: 0,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: reviewText }],
        });
        const block = message.content[0];
        rawResponse = block && block.type === 'text' ? block.text : '';
        // Parse JSON response
        const parsed = JSON.parse(rawResponse);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
            return { items: parsed, rawResponse };
        }
        console.error('[lineItem] LLM returned non-string-array JSON:', rawResponse);
        return { items: [], rawResponse };
    }
    catch (err) {
        console.error('[lineItem] LLM extraction failed:', err instanceof Error ? err.message : err);
        return { items: [], rawResponse };
    }
}
// ── Trivial tokens to ignore in token overlap matching ──────────────────────
const TRIVIAL_TOKENS = new Set([
    'the',
    'and',
    'with',
    'our',
    'your',
    'a',
    'an',
]);
// ── Item matching ───────────────────────────────────────────────────────────
/**
 * Pure function: compares extracted items against POS items.
 * Exported for unit testing.
 */
export function matchItems(extractedItems, posItems) {
    if (extractedItems.length === 0) {
        return { matched: [], matchType: 'NONE' };
    }
    const posLower = posItems.map((x) => x.toLowerCase().trim());
    const matched = [];
    let hasExact = false;
    let hasPartial = false;
    for (const extracted of extractedItems) {
        const extLower = extracted.toLowerCase().trim();
        let foundMatch = false;
        // 1. Exact match (case-insensitive)
        for (const pos of posLower) {
            if (extLower === pos) {
                matched.push(extracted);
                hasExact = true;
                foundMatch = true;
                break;
            }
        }
        if (foundMatch)
            continue;
        // 2. Substring match
        for (const pos of posLower) {
            if (extLower.includes(pos) || pos.includes(extLower)) {
                matched.push(extracted);
                hasPartial = true;
                foundMatch = true;
                break;
            }
        }
        if (foundMatch)
            continue;
        // 3. Token overlap
        const extTokens = extLower
            .split(/\s+/)
            .filter((t) => t.length > 3 && !TRIVIAL_TOKENS.has(t));
        for (const pos of posLower) {
            const posTokens = pos
                .split(/\s+/)
                .filter((t) => t.length > 3 && !TRIVIAL_TOKENS.has(t));
            const overlap = extTokens.some((et) => posTokens.includes(et));
            if (overlap) {
                matched.push(extracted);
                hasPartial = true;
                foundMatch = true;
                break;
            }
        }
    }
    if (hasExact)
        return { matched, matchType: 'EXACT' };
    if (hasPartial)
        return { matched, matchType: 'PARTIAL' };
    return { matched: [], matchType: 'NONE' };
}
// ── Full line-item factor ───────────────────────────────────────────────────
export async function computeLineItemScore(reviewText, posLineItems) {
    const posItemNames = posLineItems.map((li) => li.name);
    const { items: extractedItems, rawResponse } = await extractProductEntities(reviewText);
    // If LLM returned no items, we can't score
    if (extractedItems.length === 0) {
        return {
            score: 0.0,
            level: 'NONE',
            detail: rawResponse
                ? 'No specific product names extracted from review text (AI-assisted inference)'
                : 'LLM extraction unavailable \u2014 no product names could be analysed',
            llm_extracted_items: [],
            matched_items: [],
            pos_items: posItemNames,
            llm_raw_response: rawResponse,
        };
    }
    const { matched, matchType } = matchItems(extractedItems, posItemNames);
    let score;
    let level;
    let detail;
    if (matchType === 'EXACT') {
        score = 1.0;
        level = 'HIGH';
        detail = `Item match: review mentions ${JSON.stringify(matched)} \u2014 found in transaction ${JSON.stringify(posItemNames)} (AI-assisted inference)`;
    }
    else if (matchType === 'PARTIAL') {
        score = 0.5;
        level = 'MEDIUM';
        detail = `Partial item match: review mentions ${JSON.stringify(extractedItems)} \u2014 partial overlap with transaction ${JSON.stringify(posItemNames)} (AI-assisted inference)`;
    }
    else {
        score = 0.0;
        level = 'NONE';
        detail = `Item discrepancy: review mentions ${JSON.stringify(extractedItems)} \u2014 not found in transaction ${JSON.stringify(posItemNames)} (AI-assisted inference)`;
    }
    return {
        score,
        level,
        detail,
        llm_extracted_items: extractedItems,
        matched_items: matched,
        pos_items: posItemNames,
        llm_raw_response: rawResponse,
    };
}
//# sourceMappingURL=lineItem.js.map