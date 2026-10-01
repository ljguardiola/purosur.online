import type {
  AuthorizedIssuerIdentification,
  IssuerIdentification,
  IssuerIdentificationPorts,
} from "./issuer-identification-store.js";

export interface EditIssuerIdentificationInput {
  legalName: string;
  grossIncomeRegistration: string;
  activityStartDate: string;
  authorizedCuit: string;
  version: number;
  actorId: string;
}

export type EditIssuerIdentificationOutcome =
  | { kind: "stale_version" }
  | { kind: "unchanged"; identification: AuthorizedIssuerIdentification }
  | { kind: "edited"; identification: AuthorizedIssuerIdentification };

function isSameIssuerIdentification(
  current: IssuerIdentification,
  next: AuthorizedIssuerIdentification,
): boolean {
  return (
    current.legalName === next.legalName &&
    current.grossIncomeRegistration === next.grossIncomeRegistration &&
    current.activityStartDate === next.activityStartDate &&
    current.authorizedCuit === next.authorizedCuit
  );
}

export async function editIssuerIdentification(
  { store }: IssuerIdentificationPorts,
  { actorId, ...input }: EditIssuerIdentificationInput,
): Promise<EditIssuerIdentificationOutcome> {
  return store.transaction<EditIssuerIdentificationOutcome>(async (tx) => {
    const current = await tx.lockCurrentIssuerIdentification();
    if (current.version !== input.version) {
      return { kind: "stale_version" };
    }
    if (isSameIssuerIdentification(current, input)) {
      return { kind: "unchanged", identification: input };
    }

    const identification = { ...input, version: current.version + 1 };
    await tx.recordIssuerIdentificationVersion({ ...identification, recordedBy: actorId }, current);
    return { kind: "edited", identification };
  });
}
