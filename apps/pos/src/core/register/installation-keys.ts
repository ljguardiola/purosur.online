import type { InstallationKeysBody } from "@purosur/contracts";
import type { InstallationKeys } from "../../shared/device-credentials-messages";

export function installationKeysFrom(body: InstallationKeysBody): InstallationKeys {
  return {
    snapshot_key_versions: body.snapshot_key_versions,
    contingency_ticket_key: body.contingency_ticket_key,
    outbox_chain_key: body.outbox_chain_key,
  };
}
