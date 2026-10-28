import { AxiosRequestConfig, AxiosResponse } from 'axios';
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
export declare function validateSafeUrl(targetUrl: string, options?: {
    allowLocalhostInDev?: boolean;
}): Promise<SSRFValidationResult>;
/**
 * Executes an HTTP request with enforced SSRF protection, timeout, and max redirects
 */
export declare function safeHttpRequest<T = any>(targetUrl: string, config?: AxiosRequestConfig, options?: {
    allowLocalhostInDev?: boolean;
    timeoutMs?: number;
}): Promise<AxiosResponse<T>>;
//# sourceMappingURL=ssrf.d.ts.map