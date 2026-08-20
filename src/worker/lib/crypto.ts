const encoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

/**
 * Keyed (HMAC-SHA256) hash of a client IP. Only the hash is ever persisted.
 * The pepper must be a secret; without it the hash would be reversible over
 * the IPv4 address space, so an empty pepper is refused rather than degraded.
 */
export const hashIp = async (ip: string | null | undefined, pepper: string) => {
  if (!pepper) {
    throw new Error("hashIp requires a non-empty pepper");
  }

  const normalized = ip?.trim() || "unknown";
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(normalized)));
};
