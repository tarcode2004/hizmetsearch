/**
 * Field-level encryption for BYOK API keys.
 *
 * Why: Convex storage is encrypted at rest at the storage layer, but
 * a database breach or a misconfigured query that returns rows to the
 * wrong client would still leak the keys in plaintext. We add a
 * deliberate envelope on top so the only way to read a stored key is
 * to also have the BYOK_SECRET env var.
 *
 * Crypto: AES-GCM with a 256-bit key derived from `BYOK_SECRET` via
 * SHA-256. Random 12-byte IV per ciphertext. Encoded as
 * `v1:<base64 iv>:<base64 ciphertext>`. Old plaintext rows (no `v1:`
 * prefix) are still readable for backward-compat — they get re-encrypted
 * the next time the user updates their key.
 *
 * Runtime: Web Crypto API (`crypto.subtle`) is available in Convex's V8
 * runtime, so this file is safe to import from queries, mutations, and
 * default-runtime actions alike. No `"use node"` required.
 */

const SECRET = process.env.BYOK_SECRET ?? "";

let cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!SECRET) {
    throw new Error(
      "BYOK_SECRET env var is not set. Run `npx convex env set BYOK_SECRET <random-32-byte-base64>` before saving BYOK keys.",
    );
  }
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(SECRET));
  cachedKey = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Encrypt a plaintext API key for storage. Returns the original
 * value untouched if the input is empty (so callers can still pass
 * undefined-or-empty through unchanged).
 */
export async function encryptSecret(plain: string | undefined): Promise<string | undefined> {
  if (!plain) return plain;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `v1:${b64encode(iv)}:${b64encode(new Uint8Array(ct))}`;
}

/**
 * Decrypt a stored secret. Tolerates three cases:
 *  - undefined / null / empty       → returns null
 *  - legacy plaintext (no v1 prefix) → returned as-is (backward-compat)
 *  - v1 envelope                     → decrypted with AES-GCM
 *
 * Decryption failures (wrong key, corrupted ciphertext) return null
 * rather than throwing — the caller should treat that as "no key".
 */
export async function decryptSecret(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith("v1:")) {
    // Legacy plaintext written before encryption shipped. Still valid;
    // it gets re-encrypted on next save.
    return stored;
  }
  if (!SECRET) {
    console.warn("decryptSecret: BYOK_SECRET missing, cannot decrypt v1 secret");
    return null;
  }
  try {
    const parts = stored.split(":");
    if (parts.length !== 3) return null;
    const iv = b64decode(parts[1]);
    const ct = b64decode(parts[2]);
    const key = await getKey();
    // Cast to ArrayBuffer to satisfy strict TS DOM lib types — the
    // underlying BufferSource is fine at runtime but stricter modes
    // refuse `Uint8Array<ArrayBufferLike>` for `BufferSource`.
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch (e) {
    console.warn("decryptSecret failed:", e);
    return null;
  }
}
