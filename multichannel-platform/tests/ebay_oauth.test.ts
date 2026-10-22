import { describe, it, expect } from 'vitest';
import { EbayService } from '../services/api/src/services/ebay.service';

describe('eBay OAuth Helper & Code Extraction', () => {
  it('should extract authorization code from raw code string', () => {
    const raw = 'v^1.1#i^1#p^3#r^1#f^0#I^3#t^Ul41_fake_code_12345';
    expect(EbayService.extractAuthCode(raw)).toBe(raw);
  });

  it('should extract and decode authorization code from URL-encoded code string', () => {
    const encoded = 'v%5E1.1%23i%5E1%23p%5E3%23r%5E1%23f%5E0%23I%5E3%23t%5EUl41_fake_code_12345';
    const expected = 'v^1.1#i^1#p^3#r^1#f^0#I^3#t^Ul41_fake_code_12345';
    expect(EbayService.extractAuthCode(encoded)).toBe(expected);
  });

  it('should extract authorization code from full ThirdPartyAuthSucessFailure URL', () => {
    const fullUrl =
      'https://auth2.ebay.com/oauth2/ThirdPartyAuthSucessFailure?isAuthSuccessful=true&state=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz&code=v%5E1.1%23i%5E1%23p%5E3%23r%5E1%23f%5E0%23I%5E3%23t%5EUl41_extracted_code_99999&expires_in=299';
    const expected = 'v^1.1#i^1#p^3#r^1#f^0#I^3#t^Ul41_extracted_code_99999';
    expect(EbayService.extractAuthCode(fullUrl)).toBe(expected);
  });

  it('should generate valid sandbox consent URL with all required query parameters', () => {
    const consentUrl = EbayService.generateConsentUrl({
      hostOrEnv: 'api.sandbox.ebay.com',
      state: 'test-state-token',
    });

    expect(consentUrl).toContain('https://auth.sandbox.ebay.com/oauth2/authorize');
    expect(consentUrl).toContain('client_id=');
    expect(consentUrl).toContain('response_type=code');
    expect(consentUrl).toContain('redirect_uri=');
    expect(consentUrl).toContain('state=test-state-token');
    expect(consentUrl).toContain('prompt=login');
  });

  it('should handle whitespace and empty inputs gracefully', () => {
    expect(EbayService.extractAuthCode('')).toBe('');
    expect(EbayService.extractAuthCode('   ')).toBe('');
  });
});
