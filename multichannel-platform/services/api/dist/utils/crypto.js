"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
exports.redactSecrets = redactSecrets;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
function getKey() {
    return crypto_1.default.scryptSync(config_1.config.encryptionKey, 'multichannel-salt', 32);
}
function encryptSecret(plainText) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}
function decryptSecret(cipherText) {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
    }
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
function redactSecrets(obj) {
    if (!obj)
        return obj;
    if (typeof obj !== 'object')
        return obj;
    // Preserve Date instances
    if (obj instanceof Date)
        return obj;
    // Preserve Mongoose ObjectId / BSON ObjectId
    if (obj._bsontype === 'ObjectID' || (obj.constructor && obj.constructor.name === 'ObjectId')) {
        return obj.toString();
    }
    const sensitiveKeys = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'secret', 'apiKey'];
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(copy)) {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
            copy[key] = '[REDACTED]';
        }
        else if (copy[key] && typeof copy[key] === 'object') {
            if (copy[key]._bsontype === 'ObjectID' || (copy[key].constructor && copy[key].constructor.name === 'ObjectId')) {
                copy[key] = copy[key].toString();
            }
            else if (copy[key] instanceof Date) {
                copy[key] = copy[key];
            }
            else {
                copy[key] = redactSecrets(copy[key]);
            }
        }
    }
    return copy;
}
//# sourceMappingURL=crypto.js.map