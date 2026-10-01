import type {
  Authorization,
  AuthorizationRefusal,
  IdentifyLockedCloserOutcome,
  SignInUser,
} from "@purosur/contracts";
import { EmptyState, InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { ArrowLeft, Lock, ShieldX, TriangleAlert, UsersRound, UserX } from "lucide-react";
import { useId, useState } from "react";
import { useLockedClosersQuery } from "../access/access-queries";
import { PinAttemptControls } from "../access/pin-attempt-controls";
import { waitDescription } from "../access/pin-attempt-text";
import type { PinNotice } from "../access/pin-refusal";
import { SignInLockout } from "../access/sign-in-lockout";
import { usePinAttempt } from "../access/use-pin-attempt";
import { UserPicker } from "../access/user-picker";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { SessionEyebrow } from "../shell/session-eyebrow";

export type IdentifiedCloser = { authorization: Authorization; first_name: string };

export type ReturnedCloser = {
  refusal: Exclude<AuthorizationRefusal, { kind: "unavailable" }> | { kind: "not_locked" };
  firstName: string;
};

export type LockedCloserIdentificationProps = {
  registerName: string | null;
  openedAt: string;
  loadClosers: () => Promise<SignInUser[]>;
  identify: (closer: Authorization) => Promise<IdentifyLockedCloserOutcome>;
  returned: ReturnedCloser | undefined;
  onIdentified: (closer: IdentifiedCloser) => void;
};

function lacksPermissionNotice(firstName: string): PinNotice {
  return {
    icon: <UserX />,
    title: `${firstName} no puede cerrar la caja`,
    description: "Elegí a otra persona con permiso.",
  };
}

function returnedNotice({ refusal, firstName }: ReturnedCloser): PinNotice {
  switch (refusal.kind) {
    case "wrong_pin":
      return {
        icon: <ShieldX />,
        title: `El PIN de ${firstName} cambió`,
        description: "Elegí de nuevo quién cierra la caja.",
      };
    case "rate_limited":
      return {
        icon: <ShieldX />,
        title: "Todavía no se puede volver a intentar",
        description: waitDescription(refusal.retry_after_seconds, refusal.attempts_left),
      };
    case "locked":
      return {
        icon: <Lock />,
        title: `${firstName} está bloqueado`,
        description: `Se equivocó ${refusal.consecutive_failures} veces seguidas con el PIN. Elegí a otra persona con permiso.`,
      };
    case "lacks_permission":
      return lacksPermissionNotice(firstName);
    case "not_locked":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo cerrar la caja",
        description: "Volvé a intentarlo en unos segundos.",
      };
  }
}

function IdentificationPanel({
  registerName,
  openedAt,
  loadClosers,
  identify,
  returned,
  onIdentified,
}: LockedCloserIdentificationProps) {
  const headingId = useId();
  const closers = useLockedClosersQuery(loadClosers);
  const [chosen, setChosen] = useState<SignInUser | null>(null);
  const attempt = usePinAttempt(
    chosen === null
      ? null
      : {
          id: chosen.id,
          firstName: chosen.first_name,
          attempt: async (pin) => {
            const outcome = await identify({ user_id: chosen.id, pin });
            if (outcome.kind === "identified") {
              onIdentified({
                authorization: { user_id: chosen.id, pin },
                first_name: outcome.person.first_name,
              });
            }
            return outcome;
          },
        },
  );
  const { refusal, locked, submitting, heading } = attempt;
  const [returnedShown, setReturnedShown] = useState(true);
  let notice: PinNotice | undefined;
  if (refusal?.kind === "lacks_permission") {
    notice = lacksPermissionNotice(refusal.firstName);
  } else if (returnedShown && returned !== undefined) {
    notice = returnedNotice(returned);
  }

  function reset(user: SignInUser | null) {
    if (user !== null) {
      setReturnedShown(false);
    }
    setChosen(user);
    attempt.reset();
  }

  return (
    <main className="flex w-full max-w-110 flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <SessionEyebrow registerName={registerName} openedAt={openedAt} />
        <h1
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-display text-text-accent outline-none"
        >
          {refusal?.kind === "locked"
            ? `${refusal.firstName} está bloqueado`
            : "¿Quién cierra la caja?"}
        </h1>
      </div>
      {refusal?.kind === "locked" ? (
        <SignInLockout
          consecutiveFailures={refusal.consecutiveFailures}
          backLabel="Volver a la lista"
          onBack={() => reset(null)}
        />
      ) : null}
      {notice === undefined ? null : (
        <InlineNotice
          tone="error"
          icon={notice.icon}
          title={notice.title}
          description={notice.description}
        />
      )}
      {!locked && closers.status === "loading" ? (
        <LoadingPlaceholder variant="list" items={3} />
      ) : null}
      {!locked && closers.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar las personas con permiso"
          description="Volvé a intentarlo en unos segundos."
          onRetry={closers.retry}
        />
      ) : null}
      {!locked && closers.status === "loaded" && closers.value.length === 0 ? (
        <EmptyState
          variant="blank"
          icon={<UsersRound />}
          title="Nadie en esta caja tiene permiso para cerrar la sesión de otra persona."
        />
      ) : null}
      {!locked && closers.status === "loaded" && closers.value.length > 0 ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
          <UserPicker
            users={closers.value}
            value={chosen?.id ?? null}
            onChange={reset}
            labelledBy={headingId}
            disabled={submitting}
          />
          <PinAttemptControls
            attempt={attempt}
            pinInput={attempt.pinInput}
            disabled={chosen === null}
            submitLabel="Continuar"
          />
        </form>
      ) : null}
      {locked ? null : <ScreenLink to="/locked" icon={<ArrowLeft />} label="Volver" />}
    </main>
  );
}

export function LockedCloserIdentification(props: LockedCloserIdentificationProps) {
  return (
    <BrandPanelScreen>
      <IdentificationPanel {...props} />
    </BrandPanelScreen>
  );
}
