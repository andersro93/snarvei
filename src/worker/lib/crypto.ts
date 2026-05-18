const encoder = new TextEncoder();

export const hashIp = async (ip: string | null | undefined, secret: string) => {
  const normalized = ip?.trim() || "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${secret}:${normalized}`),
  );

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};
