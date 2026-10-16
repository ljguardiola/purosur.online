import type { SolicitationAnswer } from "@purosur/domain/fiscal/use-cases";
import { rejectionsOf } from "./wsfe-client.js";

interface DetailResponse {
  Resultado?: unknown;
  CAE?: unknown;
  CAEFchVto?: unknown;
  Observaciones?: unknown;
}

interface SolicitationResult {
  FeCabResp?: { Resultado?: unknown };
  FeDetResp?: { FECAEDetResponse?: DetailResponse | DetailResponse[] };
  Errors?: unknown;
}

function isoDateOf(compact: unknown): string | undefined {
  const match = typeof compact === "string" ? /^(\d{4})(\d{2})(\d{2})$/.exec(compact) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

export const NO_ANSWER: SolicitationAnswer = { kind: "no_answer", rejections: [] };

export function solicitationAnswerOf(answer: unknown): SolicitationAnswer {
  const result = (answer as { FECAESolicitarResult?: SolicitationResult })?.FECAESolicitarResult;
  if (result === undefined) {
    return NO_ANSWER;
  }
  const listed = result.FeDetResp?.FECAEDetResponse;
  const details = Array.isArray(listed) ? listed : listed === undefined ? [] : [listed];
  const [detail] = details;

  const dueOn = isoDateOf(detail?.CAEFchVto);
  if (
    result.FeCabResp?.Resultado === "A" &&
    detail?.Resultado === "A" &&
    typeof detail.CAE === "string" &&
    detail.CAE !== "" &&
    dueOn !== undefined
  ) {
    return { kind: "authorized", authorizationCode: detail.CAE, authorizationCodeDueOn: dueOn };
  }

  const rejections = [
    ...details.flatMap(({ Observaciones }) => rejectionsOf(Observaciones, "Obs")),
    ...rejectionsOf(result.Errors, "Err"),
  ];
  if (rejections.length === 0) {
    return NO_ANSWER;
  }
  if (result.FeCabResp?.Resultado === "R" || detail?.Resultado === "R") {
    return { kind: "rejected", rejections };
  }
  const withoutResult =
    result.FeCabResp?.Resultado === undefined && detail?.Resultado === undefined;
  return withoutResult
    ? { kind: "refused_without_result", rejections }
    : { kind: "no_answer", rejections };
}
