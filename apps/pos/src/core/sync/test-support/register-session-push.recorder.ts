import { readdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { recordingNameFrom } from "./recording-name.js";
import { registerSessionPush } from "./register-session-push.js";

const RECORDED_PUSHES_DIR = new URL("./recorded-pushes/", import.meta.url);

it("records the push a register session sends", async () => {
  const name = recordingNameFrom(
    process.env["REGISTER_PUSH_RECORDING"],
    readdirSync(RECORDED_PUSHES_DIR),
  );
  const { outboxChainKey, sentBody } = await registerSessionPush();

  writeFileSync(
    new URL(`${name}.json`, RECORDED_PUSHES_DIR),
    `${JSON.stringify({ outbox_chain_key: outboxChainKey, push: sentBody }, null, 2)}\n`,
  );
});
