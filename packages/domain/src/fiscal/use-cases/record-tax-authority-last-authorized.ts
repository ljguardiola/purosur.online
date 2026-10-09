import type { TaxAuthorityCountPorts } from "./tax-authority-count-ports.js";

export interface RecordTaxAuthorityLastAuthorizedInput {
  pointOfSale: number;
}

export type RecordTaxAuthorityLastAuthorizedOutcome =
  | { kind: "recorded" }
  | { kind: "no_token" }
  | { kind: "no_answer" };

export async function recordTaxAuthorityLastAuthorized(
  { tokens, taxAuthority, counts, clock }: TaxAuthorityCountPorts,
  { pointOfSale }: RecordTaxAuthorityLastAuthorizedInput,
): Promise<RecordTaxAuthorityLastAuthorizedOutcome> {
  const token = await tokens.validToken();
  if (token === null) {
    return { kind: "no_token" };
  }
  const answer = await taxAuthority.lastAuthorized({ token, pointOfSale });
  if (answer.kind === "no_answer") {
    return { kind: "no_answer" };
  }
  await counts.record({ pointOfSale, lastAuthorized: answer.number, readAt: clock.now() });
  return { kind: "recorded" };
}
