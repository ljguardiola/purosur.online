import type { Tone } from "@purosur/ui";
import type { FortnightPresentation } from "./fortnight-presentations-api";

const STATE_BADGES: Record<
  NonNullable<FortnightPresentation["state"]> | "pending",
  { label: string; tone: Tone }
> = {
  pending: { label: "Pendiente", tone: "warning" },
  submitting: { label: "Presentando", tone: "info" },
  refused: { label: "Rechazado", tone: "error" },
  blocked: { label: "Bloqueado", tone: "error" },
  accepted: { label: "Aceptado", tone: "success" },
  needs_regularization: { label: "A regularizar", tone: "error" },
};

export function presentationStateBadge(state: FortnightPresentation["state"]) {
  return STATE_BADGES[state ?? "pending"];
}
