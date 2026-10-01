import type { IssuerIdentificationPorts } from "./issuer-identification-store.js";

export interface RecordAuthorizedCuitInput {
  authorizedCuit: string;
}

export type RecordAuthorizedCuitOutcome =
  | { kind: "unchanged" }
  | { kind: "recorded"; version: number };

export async function recordAuthorizedCuit(
  { store }: IssuerIdentificationPorts,
  { authorizedCuit }: RecordAuthorizedCuitInput,
): Promise<RecordAuthorizedCuitOutcome> {
  return store.transaction<RecordAuthorizedCuitOutcome>(async (tx) => {
    const current = await tx.lockCurrentIssuerIdentification();
    if (current.authorizedCuit === authorizedCuit) {
      return { kind: "unchanged" };
    }

    const version = current.version + 1;
    await tx.recordIssuerIdentificationVersion(
      { ...current, authorizedCuit, version, recordedBy: null },
      current,
    );
    return { kind: "recorded", version };
  });
}
