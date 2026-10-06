import type { EventChain } from "../sync-ports.js";

export const FAKE_CHAIN_KEY = "chain-key-1";

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const fakeEventChain: EventChain = {
  link: (chainKey, previousLink, canonicalEvent) =>
    `link-${fnv1a(`${chainKey}|${previousLink ?? "origin"}|${canonicalEvent}`)}`,
};
