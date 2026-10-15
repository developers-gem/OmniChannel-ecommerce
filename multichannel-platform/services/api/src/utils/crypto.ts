import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  return crypto.scryptSync(config.encryptionKey, 'multichannel-salt', 32);
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptSecret(cipherText: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function redactSecrets(obj: any): any {
  if (!obj) return obj;
  if (typeof obj !== 'object') return obj;

  // Preserve Date instances
  if (obj instanceof Date) return obj;

  // Preserve Mongoose ObjectId / BSON ObjectId
  if (obj._bsontype === 'ObjectID' || (obj.constructor && obj.constructor.name === 'ObjectId')) {
    return obj.toString();
  }

  const sensitiveKeys = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'secret', 'apiKey'];
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(copy)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
      copy[key] = '[REDACTED]';
    } else if (copy[key] && typeof copy[key] === 'object') {
      if (copy[key]._bsontype === 'ObjectID' || (copy[key].constructor && copy[key].constructor.name === 'ObjectId')) {
        copy[key] = copy[key].toString();
      } else if (copy[key] instanceof Date) {
        copy[key] = copy[key];
      } else {
        copy[key] = redactSecrets(copy[key]);
      }
    }
  }
  return copy;
}
