"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSafeUrl = validateSafeUrl;
exports.safeHttpRequest = safeHttpRequest;
const url_1 = require("url");
const promises_1 = __importDefault(require("dns/promises"));
const axios_1 = __importDefault(require("axios"));
// CIDR patterns / checks for private and link-local ranges
function isPrivateOrReservedIP(ip) {
    // IPv4 checks
    if (ip === 'localhost' || ip === '127.0.0.1' || ip.startsWith('127.'))
        return true;
    if (ip.startsWith('10.'))
        return true;
    if (ip.startsWith('192.168.'))
        return true;
    if (ip === '169.254.169.254' || ip.startsWith('169.254.'))
        return true; // Cloud metadata
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip))
        return true;
    // IPv6 checks
    if (ip === '::1' || ip === '::' || ip.toLowerCase().startsWith('fe80:') || ip.toLowerCase().startsWith('fc00:')) {
        return true;
    }
    return false;
}
/**
 * Validates a target URL against SSRF vulnerabilities:
 * - Requires https (unless allowHttpInDev is set and NODE_ENV !== 'production')
 * - Resolves host DNS to verify it doesn't point to private RFC1918 / loopback / cloud metadata IPs
 */
async function validateSafeUrl(targetUrl, options = {}) {
    try {
        const parsed = new url_1.URL(targetUrl);
        const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
        const allowLocal = isDev && (options.allowLocalhostInDev ?? true);
        // Protocol validation
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return { valid: false, error: `Invalid protocol '${parsed.protocol}'. Only HTTP(S) supported.` };
        }
        if (!isDev && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Only HTTPS endpoints are permitted in production.' };
        }
        const hostname = parsed.hostname;
        // Check direct IP or hostname
        if (isPrivateOrReservedIP(hostname)) {
            if (allowLocal && (hostname === 'localhost' || hostname === '127.0.0.1')) {
                return { valid: true, resolvedIp: '127.0.0.1' };
            }
            return {
                valid: false,
                error: `Access to private or link-local IP '${hostname}' is strictly forbidden (SSRF Protection).`,
            };
        }
        // Resolve DNS
        try {
            const addresses = await promises_1.default.lookup(hostname, { all: true });
            for (const record of addresses) {
                if (isPrivateOrReservedIP(record.address)) {
                    if (allowLocal && (record.address === '127.0.0.1' || record.address === '::1')) {
                        continue;
                    }
                    return {
                        valid: false,
                        error: `Resolved IP address '${record.address}' belongs to a private or restricted network range (SSRF Protection).`,
                    };
                }
            }
            return { valid: true, resolvedIp: addresses[0]?.address };
        }
        catch (dnsErr) {
            return { valid: false, error: `DNS lookup failed for host '${hostname}': ${dnsErr.message}` };
        }
    }
    catch (err) {
        return { valid: false, error: `Invalid URL format: ${err.message}` };
    }
}
/**
 * Executes an HTTP request with enforced SSRF protection, timeout, and max redirects
 */
async function safeHttpRequest(targetUrl, config = {}, options = {}) {
    const validation = await validateSafeUrl(targetUrl, options);
    if (!validation.valid) {
        throw new Error(`SSRF Security Error: ${validation.error}`);
    }
    const timeout = options.timeoutMs || 8000;
    return (0, axios_1.default)({
        ...config,
        url: targetUrl,
        timeout,
        maxRedirects: 3,
        headers: {
            'User-Agent': 'MultichannelPlatform-Connector/1.0',
            ...(config.headers || {}),
        },
        validateStatus: (status) => status >= 200 && status < 400,
    });
}
//# sourceMappingURL=ssrf.js.map