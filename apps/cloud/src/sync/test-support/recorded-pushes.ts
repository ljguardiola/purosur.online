import { readdirSync, readFileSync } from "node:fs";
import { type PushEventsRequest, pushEventsRequestSchema } from "@purosur/contracts";
import { z } from "zod";

const RECORDED_PUSHES_DIR = new URL("./recorded-pushes/", import.meta.url);

const recordedPushSchema = z.object({
  outbox_chain_key: z.string().min(1),
  push: z.record(z.string(), z.unknown()),
});

export interface RecordedPush {
  name: string;
  outboxChainKey: string;
  sentBody: Record<string, unknown>;
  push: PushEventsRequest;
}

export function recordedPushes(): RecordedPush[] {
  return readdirSync(RECORDED_PUSHES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const recorded = recordedPushSchema.parse(
        JSON.parse(readFileSync(new URL(name, RECORDED_PUSHES_DIR), "utf8")),
      );
      return {
        name,
        outboxChainKey: recorded.outbox_chain_key,
        sentBody: recorded.push,
        push: pushEventsRequestSchema.parse(recorded.push),
      };
    });
}
