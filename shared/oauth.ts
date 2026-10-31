/** Only loopback HTTP callbacks with an explicit port are supported by the desktop listener. */
export function isSupportedRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
