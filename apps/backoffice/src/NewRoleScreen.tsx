import {
  PERMISSION_CATALOG,
  type PermissionArea,
  type PermissionDefinition,
  type PermissionKey,
} from "@purosur/contracts";
import { Button, Checkbox, InlineNotice, RadioGroup, TextField } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, KeyRound, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { messages } from "./messages";
import { type CreateRoleFieldError, createRole, fetchRoleCreationChallenge } from "./rolesApi";
import { navigate } from "./router";
import { ROLES_LIST_PATH } from "./settingsRoutes";

export type NewRoleScreenServices = {
  fetchRoleCreationChallenge: typeof fetchRoleCreationChallenge;
  createRole: typeof createRole;
  startAuthentication: typeof startAuthentication;
};

export const defaultNewRoleScreenServices: NewRoleScreenServices = {
  fetchRoleCreationChallenge,
  createRole,
  startAuthentication,
};

export type NewRoleScreenProps = {
  /** From the session: only an Administrator can reach this page at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: NewRoleScreenServices;
};

const rolesMessages = messages.settings.roles;
const pageMessages = rolesMessages.newRole;

// The Alertas area's own two view permissions are mutually exclusive, drawn as a radio instead of
// two checkboxes; "dismiss_alerts_manually" is a plain third permission in the same area.
type AlertsViewOption = "none" | "view_branch_alerts" | "view_all_alerts";
const ALERTS_RADIO_OPTIONS: readonly [
  { value: AlertsViewOption; label: string },
  { value: AlertsViewOption; label: string },
  { value: AlertsViewOption; label: string },
] = [
  { value: "none", label: pageMessages.alertsNoneOption },
  { value: "view_branch_alerts", label: pageMessages.alertsBranchOption },
  { value: "view_all_alerts", label: pageMessages.alertsAllOption },
];

function definitionsByArea(area: PermissionArea): PermissionDefinition[] {
  return PERMISSION_CATALOG.filter((definition) => definition.area === area);
}

// The three columns' area order, exactly as the design groups them.
const AREA_COLUMNS: readonly (readonly PermissionArea[])[] = [
  ["cashRegister", "sale", "returns", "checkout"],
  ["stock", "purchasing", "catalog", "assembledProducts"],
  ["users", "fiscal", "reports", "alerts", "devices", "backups", "branch"],
];

function validateRoleName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return pageMessages.nameRequired;
  }
  if (trimmed.toLowerCase() === rolesMessages.administratorRoleName.toLowerCase()) {
    return pageMessages.nameReserved;
  }
  return undefined;
}

function fieldErrorMessage(field: CreateRoleFieldError): string | undefined {
  return field === "name" ? pageMessages.nameFieldError : undefined;
}

type FormNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

function PermissionRegisterBadge({
  marker,
}: {
  marker: Exclude<PermissionDefinition["registerMarker"], "none">;
}) {
  const isPinBadge = marker === "register_with_another_persons_pin";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-bone px-2 py-0.5 text-xs font-semibold text-ink-secondary">
      {isPinBadge && <KeyRound aria-hidden="true" className="size-3" />}
      {isPinBadge ? rolesMessages.pinBadgeLabel : rolesMessages.cashRegisterBadgeLabel}
    </span>
  );
}

function PermissionCheckboxRow({
  definition,
  checked,
  onToggle,
}: {
  definition: PermissionDefinition;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Checkbox isSelected={checked} onChange={onToggle}>
      <span className="flex flex-wrap items-center gap-2">
        <span>{rolesMessages.permissionLabels[definition.key]}</span>
        {checked && definition.registerMarker !== "none" && (
          <PermissionRegisterBadge marker={definition.registerMarker} />
        )}
      </span>
    </Checkbox>
  );
}

function AlertsAreaBlock({
  alertsView,
  dismissChecked,
  onChangeAlertsView,
  onToggleDismiss,
}: {
  alertsView: AlertsViewOption;
  dismissChecked: boolean;
  onChangeAlertsView: (value: AlertsViewOption) => void;
  onToggleDismiss: (checked: boolean) => void;
}) {
  const selectedCount = (alertsView !== "none" ? 1 : 0) + (dismissChecked ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold text-ink">
        {rolesMessages.areaLabels.alerts}{" "}
        <span className="font-normal text-ink-secondary">
          {pageMessages.areaCount({ count: selectedCount, total: 3 })}
        </span>
      </h2>
      <RadioGroup
        label={rolesMessages.areaLabels.alerts}
        options={ALERTS_RADIO_OPTIONS}
        value={alertsView}
        onChange={onChangeAlertsView}
      />
      <Checkbox isSelected={dismissChecked} onChange={onToggleDismiss}>
        {pageMessages.dismissAlertsOption}
      </Checkbox>
    </div>
  );
}

function PermissionAreaBlock({
  area,
  selected,
  onTogglePermission,
}: {
  area: PermissionArea;
  selected: ReadonlySet<PermissionKey>;
  onTogglePermission: (key: PermissionKey, checked: boolean) => void;
}) {
  const definitions = definitionsByArea(area);
  const selectedCount = definitions.filter((definition) => selected.has(definition.key)).length;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold text-ink">
        {rolesMessages.areaLabels[area]}{" "}
        <span className="font-normal text-ink-secondary">
          {pageMessages.areaCount({ count: selectedCount, total: definitions.length })}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {definitions.map((definition) => (
          <PermissionCheckboxRow
            key={definition.key}
            definition={definition}
            checked={selected.has(definition.key)}
            onToggle={(checked) => onTogglePermission(definition.key, checked)}
          />
        ))}
      </div>
    </div>
  );
}

/** "Nuevo rol": names a role and hand-picks its permissions, confirming with a passkey to save it. */
export function NewRoleScreen({ isAdministrator, onSessionEnded, services }: NewRoleScreenProps) {
  const { fetchRoleCreationChallenge, createRole, startAuthentication } =
    services ?? defaultNewRoleScreenServices;
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isAdministrator) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={rolesMessages.forbiddenTitle}
          detail={rolesMessages.forbiddenDetail}
        />
      </div>
    );
  }

  const alertsView: AlertsViewOption = selected.has("view_branch_alerts")
    ? "view_branch_alerts"
    : selected.has("view_all_alerts")
      ? "view_all_alerts"
      : "none";
  const dismissChecked = selected.has("dismiss_alerts_manually");

  function togglePermission(key: PermissionKey, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function changeAlertsView(value: AlertsViewOption) {
    setSelected((current) => {
      const next = new Set(current);
      next.delete("view_branch_alerts");
      next.delete("view_all_alerts");
      if (value !== "none") {
        next.add(value);
      }
      return next;
    });
  }

  function toggleDismissAlerts(checked: boolean) {
    togglePermission("dismiss_alerts_manually", checked);
  }

  async function handleSubmit() {
    const error = validateRoleName(name);
    setNameError(error);
    if (error) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const challenge = await fetchRoleCreationChallenge();
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: challenge.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    if (challenge.kind !== "ok") {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const outcome = await createRole(
      { name: name.trim(), permissionKeys: Array.from(selected) },
      reauthentication,
    );
    if (outcome.kind === "ok") {
      navigate(ROLES_LIST_PATH);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "name_taken") {
      setNameError(pageMessages.nameTaken);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      setNameError(fieldErrorMessage(outcome.field));
      if (fieldErrorMessage(outcome.field) === undefined) {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{pageMessages.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">{pageMessages.heading}</h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={pageMessages.attemptFailedTitle}
            detail={pageMessages.attemptFailedDetail}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={pageMessages.rateLimitedTitle}
            detail={pageMessages.rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
        <TextField
          kind="plain-text"
          label={pageMessages.nameLabel}
          value={name}
          onChange={(value) => {
            setName(value);
            if (nameError) {
              setNameError(validateRoleName(value));
            }
          }}
          required
          {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
        />
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-bone p-4">
          <div className="flex flex-wrap items-center gap-2">
            <PermissionRegisterBadge marker="register_with_another_persons_pin" />
            <p className="text-sm text-ink-secondary">{pageMessages.referencesPinHelper}</p>
          </div>
          <p className="text-sm text-ink-secondary">{pageMessages.administratorOnlyHelper}</p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {AREA_COLUMNS.map((column) => (
            // The column's own first area is a stable, unique key: the grouping never reorders
            // and no area appears in more than one column.
            <div key={column[0]} className="flex flex-col gap-6">
              {column.map((area) =>
                area === "alerts" ? (
                  <AlertsAreaBlock
                    key={area}
                    alertsView={alertsView}
                    dismissChecked={dismissChecked}
                    onChangeAlertsView={changeAlertsView}
                    onToggleDismiss={toggleDismissAlerts}
                  />
                ) : (
                  <PermissionAreaBlock
                    key={area}
                    area={area}
                    selected={selected}
                    onTogglePermission={togglePermission}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-line border-t bg-surface-white px-8 py-4">
        <Button
          variant="secondary"
          icon={<X />}
          isDisabled={submitting}
          onPress={() => navigate(ROLES_LIST_PATH)}
        >
          {pageMessages.cancel}
        </Button>
        <Button
          variant="primary"
          icon={<Check />}
          isDisabled={submitting}
          onPress={() => void handleSubmit()}
        >
          {pageMessages.save}
        </Button>
      </div>
    </>
  );
}
