import { describe, expect, it } from 'vitest';
import { isSupportedRedirectUri } from '../shared/oauth';

describe('OAuth callback validation', () => {
  it('accepts an explicit IPv4 loopback HTTP port', () => {
    expect(isSupportedRedirectUri('http://127.0.0.1:45999/oauth/callback')).toBe(true);
  });
  it.each(['https://example.com/callback', 'http://localhost:45999/callback', 'http://127.0.0.1/callback', 'http://127.0.0.1:45999/callback?x=1', 'not a url'])('rejects unsupported callback %s', (url) => {
    expect(isSupportedRedirectUri(url)).toBe(false);
  });
});
