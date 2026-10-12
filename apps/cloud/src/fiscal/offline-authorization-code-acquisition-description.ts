import type { Fortnight } from "@purosur/domain/fiscal/use-cases";

interface DescribedRejection {
  code: number;
  message: string;
}

export function rejectionsText(rejections: readonly DescribedRejection[]): string {
  return rejections.map(({ code, message }) => `${code}: ${message}`).join("; ");
}

export function describeAcquisition(
  { start, end }: Fortnight,
  outcome: { kind: string; rejections?: readonly DescribedRejection[] },
): string {
  const line = `offline authorization code acquisition for fortnight ${start}..${end}: ${outcome.kind}`;
  return outcome.rejections === undefined
    ? line
    : `${line} (${rejectionsText(outcome.rejections)})`;
}
