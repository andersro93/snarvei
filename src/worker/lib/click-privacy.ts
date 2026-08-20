/**
 * Data minimisation for click analytics. Short links are shared in emails,
 * QR codes and campaigns, so their query strings and referers routinely carry
 * personal data or tokens. Only what the analytics actually use is kept.
 */

const MAX_USER_AGENT = 256;
const MAX_UTM_VALUE = 200;

/** Keep only utm_* campaign parameters (values capped), in their original order. */
export const sanitizeQueryString = (raw: string | null | undefined): string | null => {
  if (!raw) {
    return null;
  }
  const kept = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(raw)) {
    if (/^utm_[a-z_]+$/i.test(key)) {
      kept.append(key.toLowerCase(), value.slice(0, MAX_UTM_VALUE));
    }
  }
  const result = kept.toString();
  return result || null;
};

/** Referer origin + path only: no query string, fragment or credentials. */
export const sanitizeReferer = (raw: string | null | undefined): string | null => {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
};

export const sanitizeUserAgent = (raw: string | null | undefined): string | null => (raw ? raw.slice(0, MAX_USER_AGENT) : null);
