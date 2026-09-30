import type { SignInUser } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Select,
  sortedItems,
  textOrder,
} from "@purosur/ui";
import { ShieldX, TriangleAlert, UsersRound, UserX } from "lucide-react";
import { useEffect, useId } from "react";
import { PinField } from "./pin-field";
import type { AuthorizationState, ShownRefusal } from "./use-authorization";

type Notice = { icon: Icon; title: string; description: string };

function noticeFor(refusal: ShownRefusal): Notice {
  switch (refusal.kind) {
    case "wrong_pin":
      return {
        icon: <ShieldX />,
        title: "PIN incorrecto",
        description: "Revisá el PIN y volvé a escribirlo.",
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

export type AuthorizationSectionProps = {
  authorization: AuthorizationState;
  action: string;
  disabled?: boolean;
};

export function AuthorizationSection({
  authorization,
  action,
  disabled = false,
}: AuthorizationSectionProps) {
  const noticeId = useId();
  const { refusal, pinInput } = authorization;

  useEffect(() => {
    if (!disabled && refusal !== undefined && refusal.kind !== "lacks_permission") {
      pinInput.current?.focus();
    }
  }, [disabled, refusal, pinInput]);

  if (!authorization.required) {
    return null;
  }

  const { authorizers } = authorization;
  const options =
    authorizers.status === "loaded"
      ? sortedItems(authorizers.users, {
          order: textOrder((user: SignInUser) => user.first_name),
          direction: "ascending",
        }).map((user) => ({ value: user.id, label: user.first_name }))
      : [];
  const [firstOption, ...otherOptions] = options;
  const notice = refusal === undefined ? undefined : noticeFor(refusal);
  const pinRefused = refusal?.kind === "wrong_pin";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption font-bold text-text-eyebrow tracking-sm">
        AUTORIZA ALGUIEN CON PERMISO
      </p>
      {authorizers.status === "loading" ? <LoadingPlaceholder variant="form" fields={1} /> : null}
      {authorizers.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar las personas con permiso"
          description="Volvé a intentarlo en unos segundos."
          onRetry={authorization.retryLoading}
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
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Select
              label="Persona que autoriza"
              placeholder="Elegí a la persona"
              options={[firstOption, ...otherOptions]}
              value={authorization.chosen}
              onChange={authorization.choose}
              disabled={disabled}
            />
          </div>
          <PinField
            ref={pinInput}
            compact
            value={authorization.pin}
            onChange={authorization.type}
            disabled={disabled || authorization.chosen === null}
            {...(pinRefused ? { errorMessageId: noticeId } : {})}
          />
        </div>
      )}
      {firstOption === undefined ? null : (
        <p className="text-detail text-text-subtle">
          {authorization.person.first_name} no tiene permiso para {action}.
        </p>
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
    </div>
  );
}
