import { describe, it, expect } from 'vitest';
import { matchItems } from '../engine/factors/lineItem.js';
describe('matchItems', () => {
    it('exact match (case-insensitive) -> EXACT', () => {
        const r = matchItems(['Fish Tacos'], ['fish tacos', 'House Margarita']);
        expect(r.matchType).toBe('EXACT');
        expect(r.matched).toContain('Fish Tacos');
    });
    it('substring match -> PARTIAL', () => {
        const r = matchItems(['Tacos'], ['Fish Tacos', 'Margarita']);
        expect(r.matchType).toBe('PARTIAL');
    });
    it('no match -> NONE', () => {
        const r = matchItems(['Fish Tacos'], ['Chicken Sliders', 'House Margarita']);
        expect(r.matchType).toBe('NONE');
        expect(r.matched).toHaveLength(0);
    });
    it('empty extracted items -> NONE with empty matched', () => {
        const r = matchItems([], ['Chicken Sliders']);
        expect(r.matchType).toBe('NONE');
    });
    it('token overlap on shared meaningful token -> PARTIAL', () => {
        const r = matchItems(['Spicy Chicken Burger'], ['Chicken Sliders']);
        expect(r.matchType).toBe('PARTIAL');
    });
    it('reversed substring match works', () => {
        const r = matchItems(['House Margarita'], ['Margarita']);
        expect(r.matchType).toBe('PARTIAL');
    });
    it('trivial tokens are ignored', () => {
        // "the" is trivial, no meaningful token overlap
        const r = matchItems(['The Best'], ['The Worst']);
        expect(r.matchType).toBe('NONE');
    });
});
//# sourceMappingURL=lineItem.test.js.map