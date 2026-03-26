import { describe, it, expect } from 'vitest';
import { jaroWinkler, computeIdentityScore, } from '../engine/factors/identity.js';
describe('jaroWinkler', () => {
    it('identical strings return 1.0', () => {
        expect(jaroWinkler('michael', 'michael')).toBe(1.0);
    });
    it('completely different strings return low score', () => {
        expect(jaroWinkler('john', 'sarah')).toBeLessThan(0.5);
    });
    it('empty string returns 0.0', () => {
        expect(jaroWinkler('', 'michael')).toBe(0.0);
    });
    it('both empty strings return 1.0', () => {
        expect(jaroWinkler('', '')).toBe(1.0);
    });
    it('MARTHA / MARHTA classic example', () => {
        const score = jaroWinkler('MARTHA', 'MARHTA');
        expect(score).toBeGreaterThan(0.96);
        expect(score).toBeLessThanOrEqual(1.0);
    });
    it('Michael T. vs Michael Torres scores HIGH', () => {
        const result = computeIdentityScore('Michael T.', 'Michael Torres');
        expect(result.level).toBe('HIGH');
        expect(result.score).toBe(1.0);
    });
    it('null customer name returns NO_DATA not NONE', () => {
        const result = computeIdentityScore('Michael T.', null);
        expect(result.level).toBe('NO_DATA');
        expect(result.name_window_expired).toBe(true);
    });
    it('completely different names return NONE', () => {
        const result = computeIdentityScore('John Smith', 'Sarah Johnson');
        expect(result.level).toBe('NONE');
        expect(result.score).toBe(0.0);
    });
});
//# sourceMappingURL=identity.test.js.map