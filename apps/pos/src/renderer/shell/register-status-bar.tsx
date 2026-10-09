import type { RegisterStatus } from "@purosur/contracts";
import {
  Card,
  formatClockTime,
  LoadFailure,
  LoadingPlaceholder,
  LocalAlertExplanation,
  StatusIndicator,
} from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";
import type { CashSessionState } from "../register/cash-session-state";
import type { SignedInPerson } from "./signed-in-person";

export type RegisterStatusBarProps = {
  person: SignedInPerson | undefined;
  cashSession: CashSessionState;
  status: CoreData<RegisterStatus>;
};

function sessionText(cashSession: CashSessionState): string | undefined {
  if (cashSession.status === "none") {
    return "Sin sesión abierta";
  }
  if (cashSession.status === "open" && !cashSession.locked) {
    return `Sesión abierta ${formatClockTime(cashSession.openedAt)}`;
  }
  return undefined;
}

function CloudIndicator({ cloud }: { cloud: RegisterStatus["cloud"] }) {
  if (cloud === "reachable") {
    return <StatusIndicator tone="success">Nube conectada</StatusIndicator>;
  }
  if (cloud === "unreachable") {
    return <StatusIndicator tone="error">Sin conexión con la nube</StatusIndicator>;
  }
  return (
    <StatusIndicator tone="neutral" busy>
      Conectando con la nube
    </StatusIndicator>
  );
}

export function RegisterStatusBar({ person, cashSession, status }: RegisterStatusBarProps) {
  const session = sessionText(cashSession);
  return (
    <section
      aria-label="Estado de la caja"
      className="flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-6 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {person === undefined ? null : (
          <p className="font-semibold text-text text-detail">{person.first_name}</p>
        )}
        {session === undefined ? null : <p className="text-text-subtle text-detail">{session}</p>}
        {status.status === "loaded" ? <CloudIndicator cloud={status.value.cloud} /> : null}
      </div>
      {status.status === "loading" ? <LoadingPlaceholder variant="card" lines={1} /> : null}
      {status.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer el estado de la caja"
          onRetry={status.retry}
        />
      ) : null}
      {status.status === "loaded"
        ? status.value.conditions.map((condition) => (
            <Card key={condition} variant="subtle">
              <LocalAlertExplanation kind={condition} title />
            </Card>
          ))
        : null}
    </section>
  );
}
