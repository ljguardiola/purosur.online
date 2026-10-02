import { hasDistinctKeyVersions, isWellFormedInstallationKey } from "@purosur/domain";
import { z } from "zod";

const installationKeySchema = z.string().refine(isWellFormedInstallationKey);

const versionedKeySchema = z.object({
  version: z.number().int().positive(),
  key: installationKeySchema,
});

export const installationKeysSchema = z.object({
  snapshot_key_versions: z.array(versionedKeySchema).min(1).refine(hasDistinctKeyVersions),
  contingency_ticket_key: versionedKeySchema,
  outbox_chain_key: installationKeySchema,
});

export type InstallationKeysBody = z.output<typeof installationKeysSchema>;
