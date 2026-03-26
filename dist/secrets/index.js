/**
 * src/secrets/index.ts
 *
 * AES-256-GCM encryption / decryption service for POS API credentials.
 * Uses Node.js built-in `crypto` — no third-party crypto libraries.
 *
 * Intentionally does NOT import src/env.ts to avoid circular dependencies
 * and to allow the self-test to run without a full env being present.
 * Key validation is done inside validateEncryptionKey(), which env.ts calls
 * at startup after its own zod parse.
 *
 * Key rules enforced here:
 *   - ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars). Fail at startup if not.
 *   - Each encrypt() call generates a fresh random 12-byte IV — IVs are never reused.
 *   - decrypt() verifies the GCM auth tag and throws on tampered/corrupt ciphertext.
 *   - hashName() normalises input (lowercase + trim) before hashing to reduce false negatives.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, } from 'crypto';
// ── Key helpers ────────────────────────────────────────────────────────────────
/**
 * Validates that ENCRYPTION_KEY is exactly 32 bytes (64 hex chars).
 * Called once at application startup from src/index.ts (and transitively
 * from src/env.ts validation).
 *
 * @throws {Error} if the key is missing, not hex, or wrong length
 */
export function validateEncryptionKey() {
    const key = process.env['ENCRYPTION_KEY'] ?? '';
    if (key.length !== 64) {
        throw new Error(`[ReviewGuard/secrets] ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
            `Got ${key.length} characters. ` +
            `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    }
    if (!/^[0-9a-fA-F]+$/.test(key)) {
        throw new Error(`[ReviewGuard/secrets] ENCRYPTION_KEY must be a hex string (0-9, a-f). ` +
            `Got an invalid character.`);
    }
}
/**
 * Returns the 32-byte Buffer for the current ENCRYPTION_KEY.
 * Throws clearly if the key is absent — callers should always have called
 * validateEncryptionKey() at startup before reaching this.
 */
function getKeyBuffer() {
    const key = process.env['ENCRYPTION_KEY'];
    if (!key) {
        throw new Error('[ReviewGuard/secrets] ENCRYPTION_KEY is not set');
    }
    return Buffer.from(key, 'hex');
}
// ── encrypt ────────────────────────────────────────────────────────────────────
/**
 * Encrypts a UTF-8 plaintext string with AES-256-GCM.
 *
 * A fresh 12-byte IV is generated for every call — never reuse IVs with GCM.
 *
 * @param plaintext  The value to encrypt (e.g. a Square access token)
 * @returns          { ciphertext, iv, tag } — all hex-encoded
 */
export function encrypt(plaintext) {
    // 12 bytes is the recommended GCM nonce size (96 bits)
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKeyBuffer(), iv);
    const ciphertextBuf = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    // getAuthTag() must be called AFTER final()
    const tag = cipher.getAuthTag();
    return {
        ciphertext: ciphertextBuf.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
    };
}
// ── decrypt ────────────────────────────────────────────────────────────────────
/**
 * Decrypts an EncryptedBlob produced by `encrypt()`.
 *
 * The GCM auth tag is verified before any plaintext is returned.
 * If the tag check fails (tampered ciphertext, wrong key, or corrupt data)
 * an error is thrown — this function never silently returns garbage.
 *
 * @param blob  The { ciphertext, iv, tag } triple returned by `encrypt()`
 * @returns     The original UTF-8 plaintext
 * @throws      If the auth tag verification fails
 */
export function decrypt(blob) {
    const iv = Buffer.from(blob.iv, 'hex');
    const tag = Buffer.from(blob.tag, 'hex');
    const ciphertext = Buffer.from(blob.ciphertext, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', getKeyBuffer(), iv);
    // Must set auth tag BEFORE calling update()/final()
    decipher.setAuthTag(tag);
    // If the tag does not match, final() throws "Unsupported state or unable to
    // authenticate data" — we let that propagate so callers see a clear error.
    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}
// ── hashName ───────────────────────────────────────────────────────────────────
/**
 * Produces a salted SHA-256 hash of a customer name for privacy-preserving storage.
 *
 * Normalisation applied before hashing:
 *   - toLowerCase()  — "John" and "john" hash to the same value
 *   - trim()         — leading / trailing whitespace stripped
 *
 * The salt is the merchant's google_place_id, which is:
 *   - Stable across syncs (same merchant always uses the same salt)
 *   - Unique per merchant (prevents cross-merchant hash collisions / rainbow tables)
 *
 * @param name   Customer name (from POS transaction)
 * @param salt   Merchant's google_place_id
 * @returns      Hex SHA-256 digest of "<salt>:<normalised_name>"
 */
export function hashName(name, salt) {
    const normalised = name.toLowerCase().trim();
    return createHash('sha256').update(`${salt}:${normalised}`).digest('hex');
}
// ── Self-test (run directly: npx tsx src/secrets/index.ts) ────────────────────
// ESM equivalent of `if (require.main === module)`
// process.argv[1] is the entry-point script resolved by Node.
if (typeof process !== 'undefined' &&
    process.argv[1] != null &&
    new URL(import.meta.url).pathname === process.argv[1]) {
    // Provide a test key so the self-test runs without a real .env
    if (!process.env['ENCRYPTION_KEY']) {
        process.env['ENCRYPTION_KEY'] = '0'.repeat(64); // 32 zero-bytes
    }
    console.log('[secrets self-test] Starting…');
    // ── Round-trip ──────────────────────────────────────────────────────────────
    const plaintext = 'hello';
    const blob = encrypt(plaintext);
    console.log('[secrets self-test] Encrypted blob:', blob);
    const recovered = decrypt(blob);
    console.log(`[secrets self-test] decrypt(encrypt("${plaintext}")) === "${recovered}"`);
    if (recovered !== plaintext) {
        console.error('[secrets self-test] FAILED: round-trip mismatch!');
        process.exit(1);
    }
    console.log('[secrets self-test] ✓ Round-trip passed');
    // ── Tamper detection ────────────────────────────────────────────────────────
    let tamperDetected = false;
    try {
        decrypt({ ...blob, ciphertext: 'deadbeef' + blob.ciphertext.slice(8) });
    }
    catch {
        tamperDetected = true;
    }
    if (!tamperDetected) {
        console.error('[secrets self-test] FAILED: tampered ciphertext was not rejected!');
        process.exit(1);
    }
    console.log('[secrets self-test] ✓ Tamper detection passed');
    // ── hashName normalisation ──────────────────────────────────────────────────
    const h1 = hashName('  John Doe  ', 'ChIJ_test');
    const h2 = hashName('john doe', 'ChIJ_test');
    if (h1 !== h2) {
        console.error('[secrets self-test] FAILED: hashName normalisation broken!');
        process.exit(1);
    }
    console.log('[secrets self-test] ✓ hashName normalisation passed');
    console.log('[secrets self-test] All checks PASSED.');
}
//# sourceMappingURL=index.js.map