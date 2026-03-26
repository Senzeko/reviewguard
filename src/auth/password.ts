/**
 * src/auth/password.ts
 *
 * Password hashing using Node's built-in crypto.scrypt.
 * No third-party dependencies — consistent with src/secrets/index.ts pattern.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'crypto';

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_BYTES).toString('hex');
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return resolve(false);
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey));
    });
  });
}
