import type { Icon } from "@purosur/ui";
import {
  Button,
  CardModal,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  PinDotsField,
  UserSelect,
} from "@purosur/ui";
import { Lock, ShieldCheck, ShieldX, TriangleAlert, UsersRound, UserX } from "lucide-react";
import { useEffect, useId } from "react";
import { useKeys } from "../platform/key-layer";
import { waitDescription } from "../platform/pin-attempt-text";
import type { AuthorizationState, ShownRefusal } from "./use-authorization";
import { sortedAuthorizers } from "./use-authorization";

type Notice = { icon: Icon; title: string; description: string };

function noticeFor(refusal: ShownRefusal, secondsLeft: number): Notice | undefined {
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
    case "locked":
      return {
        icon: <Lock />,
        title:
          refusal.firstName === undefined
            ? "Esa persona está bloqueada"
            : `${refusal.firstName} está bloqueado`,
        description: `Se equivocó ${refusal.consecutiveFailures} veces seguidas con el PIN. Elegí a otra persona con permiso.`,
      };
    case "lacks_permission":
      return {
        icon: <UserX />,
        title: `${refusal.firstName ?? "Esa persona"} no puede autorizar esto`,
        description: "Elegí a otra persona con permiso.",
      };
    case "unavailable":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo verificar el PIN",
        description: "Volvé a intentarlo en unos segundos.",
      };
  }
}

export type AuthorizationModalProps = {
  authorization: AuthorizationState;
  subtitle: string;
  action: string;
  submitting?: boolean;
  onConfirm: () => void;
};

export function AuthorizationModal({
  authorization,
  subtitle,
  action,
  submitting = false,
  onConfirm,
}: AuthorizationModalProps) {
  const noticeId = useId();
  const { asking, authorizers, chosen, pin, refusal, secondsLeft, pinInput } = authorization;
  const options =
    authorizers.status === "loaded"
      ? sortedAuthorizers(authorizers.value).map((user) => ({
          value: user.id,
          label: user.first_name,
        }))
      : [];
  const [firstOption, ...otherOptions] = options;
  const refusedPerson =
    (refusal?.kind === "locked" || refusal?.kind === "lacks_permission") &&
    refusal.userId === chosen;
  const canConfirm =
    !submitting && secondsLeft === 0 && !refusedPerson && chosen !== null && pin !== "";

  useEffect(() => {
    if (asking && !submitting && secondsLeft === 0) {
      pinInput.current?.focus();
    }
  }, [asking, submitting, secondsLeft, refusal, pinInput]);

  function move(step: 1 | -1) {
    const current = options.findIndex((option) => option.value === chosen);
    const next = options[Math.min(options.length - 1, Math.max(0, current + step))];
    if (next !== undefined) {
      authorization.choose(next.value);
    }
  }

  useKeys(
    [
      {
        key: "ArrowUpDown",
        run: (pressed) => move(pressed === "ArrowDown" ? 1 : -1),
        enabled: !submitting && firstOption !== undefined,
      },
      { key: "Enter", run: onConfirm, enabled: canConfirm },
    ],
    { modal: true, active: asking },
  );

  const notice = refusal === undefined ? undefined : noticeFor(refusal, secondsLeft);
  const pinRefused =
    notice !== undefined && (refusal?.kind === "wrong_pin" || refusal?.kind === "rate_limited");

  return (
    <CardModal
      open={asking}
      onOpenChange={(open) => {
        if (!open) {
          authorization.cancel();
        }
      }}
      icon={<ShieldCheck />}
      title="Autorizar"
      subtitle={subtitle}
      closable={!submitting}
      action={
        <Button
          fullWidth
          icon={<ShieldCheck />}
          keycap="Enter"
          disabled={!canConfirm}
          onPress={onConfirm}
        >
          Autorizar
        </Button>
      }
    >
      {authorizers.status === "loading" ? <LoadingPlaceholder variant="form" fields={2} /> : null}
      {authorizers.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar las personas con permiso"
          description="Volvé a intentarlo en unos segundos."
          onRetry={authorizers.retry}
        />
      ) : null}
      {authorizers.status === "loaded" && firstOption === undefined ? (
        <EmptyState
          variant="blank"
          icon={<UsersRound />}
          title={`Nadie en esta caja tiene permiso para ${action}.`}
        />
      ) : null}
      {firstOption === undefined ? null : (
        <>
          <UserSelect
            label="USUARIO"
            options={[firstOption, ...otherOptions]}
            value={chosen}
            onChange={authorization.choose}
            disabled={submitting}
          />
          <PinDotsField
            ref={pinInput}
            label="PIN"
            value={pin}
            onChange={authorization.type}
            autoFocus
            disabled={submitting || chosen === null || refusedPerson || secondsLeft > 0}
            {...(pinRefused ? { errorMessageId: noticeId } : {})}
          />
        </>
      )}
      {notice === undefined ? null : (
        <div id={noticeId}>
          <InlineNotice
            tone="error"
            icon={notice.icon}
            title={notice.title}
            description={notice.description}
          />
        </div>
      )}
    </CardModal>
  );
}
