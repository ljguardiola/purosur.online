import { createHmac } from "node:crypto";
import type { EventChain } from "@purosur/domain/sync/use-cases";

const CHAIN_LENGTH_BYTES = 32;

export const hmacEventChain: EventChain = {
  link(chainKey, previousLink, canonicalEvent) {
    const previous =
      previousLink === null
        ? Buffer.alloc(CHAIN_LENGTH_BYTES)
        : Buffer.from(previousLink, "base64");
    return createHmac("sha256", Buffer.from(chainKey, "base64"))
      .update(previous)
      .update(Buffer.from(canonicalEvent, "utf8"))
      .digest("base64");
  },
};
