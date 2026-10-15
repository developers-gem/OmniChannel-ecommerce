import { URL } from 'url';
import dns from 'dns/promises';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// CIDR patterns / checks for private and link-local ranges
function isPrivateOrReservedIP(ip: string): boolean {
  // IPv4 checks
  if (ip === 'localhost' || ip === '127.0.0.1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip === '169.254.169.254' || ip.startsWith('169.254.')) return true; // Cloud metadata
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;

  // IPv6 checks
  if (ip === '::1' || ip === '::' || ip.toLowerCase().startsWith('fe80:') || ip.toLowerCase().startsWith('fc00:')) {
    return true;
  }

  return false;
}

export interface SSRFValidationResult {
  valid: boolean;
  error?: string;
  resolvedIp?: string;
}

/**
 * Validates a target URL against SSRF vulnerabilities:
 * - Requires https (unless allowHttpInDev is set and NODE_ENV !== 'production')
 * - Resolves host DNS to verify it doesn't point to private RFC1918 / loopback / cloud metadata IPs
 */
export async function validateSafeUrl(
  targetUrl: string,
  options: { allowLocalhostInDev?: boolean } = {}
): Promise<SSRFValidationResult> {
  try {
    const parsed = new URL(targetUrl);

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
      const addresses = await dns.lookup(hostname, { all: true });
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
    } catch (dnsErr: any) {
      return { valid: false, error: `DNS lookup failed for host '${hostname}': ${dnsErr.message}` };
    }
  } catch (err: any) {
    return { valid: false, error: `Invalid URL format: ${err.message}` };
  }
}

/**
 * Executes an HTTP request with enforced SSRF protection, timeout, and max redirects
 */
export async function safeHttpRequest<T = any>(
  targetUrl: string,
  config: AxiosRequestConfig = {},
  options: { allowLocalhostInDev?: boolean; timeoutMs?: number } = {}
): Promise<AxiosResponse<T>> {
  const validation = await validateSafeUrl(targetUrl, options);
  if (!validation.valid) {
    throw new Error(`SSRF Security Error: ${validation.error}`);
  }

  const timeout = options.timeoutMs || 8000;

  return axios({
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
