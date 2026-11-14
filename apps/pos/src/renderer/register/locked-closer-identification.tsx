import type {
  Authorization,
  AuthorizationRefusal,
  IdentifyLockedCloserOutcome,
  SignInUser,
} from "@purosur/contracts";
import {
  EmptyState,
  LoadFailure,
  LoadingPlaceholder,
  sortedItems,
  textOrder,
  UserSelect,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Lock, ShieldX, TriangleAlert, UsersRound, UserX } from "lucide-react";
import { useState } from "react";
import { useKeys } from "../platform/key-layer";
import { PinAttemptControls } from "../platform/pin-attempt-controls";
import { waitDescription } from "../platform/pin-attempt-text";
import type { PinNotice } from "../platform/pin-refusal";
import { SignInLockout } from "../platform/sign-in-lockout";
import { usePinAttempt } from "../platform/use-pin-attempt";
import { BrandPanelCard } from "../shell/brand-panel-card";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { useLockedClosersQuery } from "./register-queries";

export type IdentifiedCloser = { authorization: Authorization; first_name: string };

export type ReturnedCloser = {
  refusal: Exclude<AuthorizationRefusal, { kind: "unavailable" }> | { kind: "not_locked" };
  userId: string;
  firstName: string;
};

export type LockedCloserIdentificationProps = {
  sessionId: string;
  version: string | null;
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

function alphabetically(users: readonly SignInUser[]): SignInUser[] {
  return sortedItems(users, {
    order: textOrder((user: SignInUser) => user.first_name),
    direction: "ascending",
  });
}

function IdentificationPanel({
  sessionId,
  loadClosers,
  identify,
  returned,
  onIdentified,
}: LockedCloserIdentificationProps) {
  const navigate = useNavigate();
  const closers = useLockedClosersQuery(sessionId, loadClosers);
  const [chosenId, setChosenId] = useState<string | null>(returned?.userId ?? null);
  const [returnedShown, setReturnedShown] = useState(true);
  const people = closers.status === "loaded" ? alphabetically(closers.value) : [];
  const chosen = people.find((person) => person.id === chosenId) ?? people[0] ?? null;
  const attempt = usePinAttempt(
    chosen === null
      ? null
      : {
          id: chosen.id,
          firstName: chosen.first_name,
          attempt: async (pin) => {
            setReturnedShown(false);
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
  let notice: PinNotice | undefined;
  if (refusal?.kind === "lacks_permission") {
    notice = lacksPermissionNotice(refusal.firstName);
  } else if (returnedShown && returned !== undefined) {
    notice = returnedNotice(returned);
  }

  function choose(id: string) {
    setReturnedShown(false);
    setChosenId(id);
    attempt.reset();
  }

  function move(step: 1 | -1) {
    const current = people.findIndex((person) => person.id === chosen?.id);
    const next = people[Math.min(people.length - 1, Math.max(0, current + step))];
    if (next !== undefined && next.id !== chosen?.id) {
      choose(next.id);
    }
  }

  useKeys([
    {
      key: "ArrowUpDown",
      run: (pressed) => move(pressed === "ArrowDown" ? 1 : -1),
      enabled: people.length > 0 && !submitting && !locked,
    },
    {
      key: "Escape",
      run: () => {
        if (locked) {
          attempt.reset();
        } else if (!submitting) {
          void navigate({ to: "/locked" });
        }
      },
    },
    { key: "F3", run: () => void navigate({ to: "/pin-code-redemption" }), enabled: locked },
    {
      key: "R",
      run: () => {
        if (closers.status === "failed") {
          closers.retry();
        }
      },
      enabled: closers.status === "failed",
    },
  ]);

  const [firstOption, ...otherOptions] = people.map((person) => ({
    value: person.id,
    label: person.first_name,
  }));

  if (refusal?.kind === "locked") {
    return (
      <BrandPanelCard
        icon={<Lock />}
        title={`${refusal.firstName} está bloqueado`}
        titleRef={heading}
        escapeKeycap
      >
        <SignInLockout consecutiveFailures={refusal.consecutiveFailures} />
      </BrandPanelCard>
    );
  }

  return (
    <BrandPanelCard icon={<Lock />} title="¿Quién cierra la caja?" escapeKeycap>
      {closers.status === "loading" ? <LoadingPlaceholder variant="list" items={3} /> : null}
      {closers.status === "failed" ? (
        <LoadFailure
          variant="keyboard"
          keycap="R"
          icon={<TriangleAlert />}
          title="No se pudieron cargar las personas con permiso"
          description="Volvé a intentarlo en unos segundos."
          onRetry={closers.retry}
        />
      ) : null}
      {closers.status === "loaded" && people.length === 0 ? (
        <EmptyState
          variant="blank"
          icon={<UsersRound />}
          title="Nadie en esta caja tiene permiso para cerrar la sesión de otra persona."
        />
      ) : null}
      {firstOption === undefined ? null : (
        <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
          <UserSelect
            label="USUARIO"
            options={[firstOption, ...otherOptions]}
            value={chosen?.id ?? null}
            onChange={choose}
            disabled={submitting}
          />
          <PinAttemptControls
            attempt={attempt}
            pinInput={attempt.pinInput}
            submitLabel="Continuar"
            notice={notice}
          />
        </form>
      )}
    </BrandPanelCard>
  );
}

export function LockedCloserIdentification(props: LockedCloserIdentificationProps) {
  return (
    <BrandPanelScreen version={props.version}>
      <IdentificationPanel {...props} />
    </BrandPanelScreen>
  );
}
