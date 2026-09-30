import type { SignInOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { ShieldX, TriangleAlert, UserX } from "lucide-react";
import { waitDescription } from "./pin-attempt-text";

export type Refusal =
  | Exclude<SignInOutcome, { kind: "signed_in" | "locked" }>
  | { kind: "locked"; firstName: string; consecutiveFailures: number };

export type PinNotice = { icon: Icon; title: string; description: string };

const UNAVAILABLE_NOTICE: PinNotice = {
  icon: <TriangleAlert />,
  title: "No se pudo verificar el PIN",
  description: "Volvé a intentarlo en unos segundos.",
};

export function noticeFor(refusal: Refusal, secondsLeft: number): PinNotice | undefined {
  switch (refusal.kind) {
    case "wrong_pin":
      return {
        icon: <ShieldX />,
        title: "PIN incorrecto",
        description: waitDescription(secondsLeft, refusal.attempts_left),
      };
    case "rate_limited":
      return secondsLeft === 0
        ? undefined
        : {
            icon: <ShieldX />,
            title: "Todavía no se puede volver a intentar",
            description: waitDescription(secondsLeft, refusal.attempts_left),
          };
    case "no_register_permission":
      return {
        icon: <UserX />,
        title: "Sin permisos en la caja",
        description:
          "Tu usuario no tiene ningún permiso para usar la caja. Pedile a quien administra los usuarios que te asigne uno.",
      };
    case "locked":
      return undefined;
    case "unavailable":
      return UNAVAILABLE_NOTICE;
  }
}
