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
/**
 * Validates that ENCRYPTION_KEY is exactly 32 bytes (64 hex chars).
 * Called once at application startup from src/index.ts (and transitively
 * from src/env.ts validation).
 *
 * @throws {Error} if the key is missing, not hex, or wrong length
 */
export declare function validateEncryptionKey(): void;
/**
 * The three components that must be stored together to decrypt a secret.
 * All fields are hex-encoded strings safe for storage in TEXT columns.
 */
export interface EncryptedBlob {
    /** Hex-encoded AES-256-GCM ciphertext */
    ciphertext: string;
    /** Hex-encoded 12-byte GCM initialisation vector (unique per encryption) */
    iv: string;
    /** Hex-encoded 16-byte GCM authentication tag */
    tag: string;
}
/**
 * Encrypts a UTF-8 plaintext string with AES-256-GCM.
 *
 * A fresh 12-byte IV is generated for every call — never reuse IVs with GCM.
 *
 * @param plaintext  The value to encrypt (e.g. a Square access token)
 * @returns          { ciphertext, iv, tag } — all hex-encoded
 */
export declare function encrypt(plaintext: string): EncryptedBlob;
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
export declare function decrypt(blob: EncryptedBlob): string;
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
export declare function hashName(name: string, salt: string): string;
//# sourceMappingURL=index.d.ts.map