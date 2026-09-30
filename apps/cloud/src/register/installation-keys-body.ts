import type { InstallationKeysBody } from "@purosur/contracts";
import type { InstallationKeys } from "@purosur/domain/register/use-cases";

export function installationKeysBody(keys: InstallationKeys): InstallationKeysBody {
  return {
    snapshot_key_versions: keys.snapshotKeyVersions,
    contingency_ticket_key: keys.contingencyTicketKey,
    outbox_chain_key: keys.outboxChainKey,
  };
}
