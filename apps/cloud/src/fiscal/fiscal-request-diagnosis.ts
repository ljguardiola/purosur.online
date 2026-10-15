import type { NumberingConflictRequest } from "@purosur/domain/fiscal/use-cases";

export function diagnosisOf(diagnosis: string | null): NumberingConflictRequest["diagnosis"] {
  switch (diagnosis) {
    case "date_behind":
      return { kind: "date_behind" };
    case "collision":
      return { kind: "collision" };
    default:
      return null;
  }
}
