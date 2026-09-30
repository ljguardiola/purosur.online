import type { FirstPinCodeRequestOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { ShieldX, TriangleAlert, UserX, WifiOff } from "lucide-react";
import { useState } from "react";
import { retryAfterText } from "../shell/retry-after-text";

export type FirstPinCodeNotice = { icon: Icon; title: string; description: string };

type Refused = Exclude<FirstPinCodeRequestOutcome, { kind: "sent" }>;

function noticeFor(refused: Refused): FirstPinCodeNotice {
  switch (refused.kind) {
    case "pin_already_set":
      return {
        icon: <ShieldX />,
        title: "Ya tenés PIN",
        description: "Volvé al inicio y entrá con tu PIN.",
      };
    case "not_found":
      return {
        icon: <UserX />,
        title: "No encontramos tu usuario",
        description:
          "Puede que ya no tenga acceso a esta sucursal. Consultá con quien administra los usuarios.",
      };
    case "rate_limited":
      return {
        icon: <ShieldX />,
        title: "Demasiadas solicitudes",
        description: retryAfterText(refused.retry_after_seconds),
      };
    case "email_unavailable":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo enviar el código",
        description: "El correo no salió. Probá de nuevo en unos minutos.",
      };
    case "unreachable":
      return {
        icon: <WifiOff />,
        title: "Sin conexión a internet",
        description: "El código se manda en línea. Cuando vuelva la conexión se puede pedir.",
      };
    case "unavailable":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo pedir el código",
        description: "Puro Sur no responde en este momento. Probá de nuevo en unos minutos.",
      };
  }
}

export function useFirstPinCodeRequest({
  request,
  onSent,
}: {
  request: () => Promise<FirstPinCodeRequestOutcome>;
  onSent: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<Refused>();

  async function ask() {
    if (asking) {
      return;
    }
    setRefused(undefined);
    setAsking(true);
    const outcome = await request().catch(
      (): FirstPinCodeRequestOutcome => ({ kind: "unavailable" }),
    );
    setAsking(false);
    if (outcome.kind === "sent") {
      onSent();
    } else {
      setRefused(outcome);
    }
  }

  return { ask, asking, notice: refused === undefined ? undefined : noticeFor(refused) };
}
