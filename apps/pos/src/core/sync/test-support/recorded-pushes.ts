import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";

const RECORDED_PUSHES_DIR = new URL("./recorded-pushes/", import.meta.url);

const sentPushSchema = z.object({
  events: z.array(
    z.object({ event_type: z.string(), schema_version: z.number() }).catchall(z.json()),
  ),
});

type SentEvent = z.infer<typeof sentPushSchema>["events"][number];

export function sentEvents(body: unknown): SentEvent[] {
  return sentPushSchema.parse(JSON.parse(JSON.stringify(body))).events;
}

export function recordedEvents(): SentEvent[] {
  return readdirSync(RECORDED_PUSHES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) =>
      sentEvents(
        z
          .object({ push: z.unknown() })
          .parse(JSON.parse(readFileSync(new URL(name, RECORDED_PUSHES_DIR), "utf8"))).push,
      ),
    );
}
