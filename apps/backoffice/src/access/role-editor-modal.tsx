import type { PermissionArea, PermissionKey } from "@purosur/domain";
import {
  Button,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  type LoadStatus,
  Modal,
  plural,
} from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  ArrowLeft,
  Check,
  RotateCcw,
  Shield,
  ShieldOff,
  ShieldX,
  TriangleAlert,
  User,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useRefreshAccess, useReloadRole, useRoleQuery } from "./access-queries";
import { useAuthorization } from "./authorization-modal";
import { roleDisplayName } from "./role-display";
import { RoleEditorForm, roleFieldErrorMessage, validateRoleName } from "./role-editor-form";
import { withOneAlertView } from "./role-permissions";
import {
  type AssignedUser,
  type CreateRoleOutcome,
  createRole,
  type EditRoleOutcome,
  editRole,
  fetchRole,
  type RoleDetail,
  type RoleSummary,
} from "./roles-api";
import { useSendToMyAccount } from "./send-to-my-account";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";

export type RoleEditorRequest =
  | { kind: "new" }
  | { kind: "edit"; roleId: string }
  | { kind: "duplicate"; source: RoleSummary };

export type RoleEditorModalServices = {
  fetchRole: typeof fetchRole;
  createRole: typeof createRole;
  editRole: typeof editRole;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

const defaultRoleEditorModalServices: RoleEditorModalServices = {
  fetchRole,
  createRole,
  editRole,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export type RoleEditorModalProps = {
  request: RoleEditorRequest | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  services?: RoleEditorModalServices;
};

type FormNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" };

type RoleSaveConfirmationModalProps = {
  open: boolean;
  roleName: string;
  assignedUsers: AssignedUser[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

function RoleSaveConfirmationModal({
  open,
  roleName,
  assignedUsers,
  submitting,
  onBack,
  onConfirm,
}: RoleSaveConfirmationModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onBack();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<Users />}
      headerLayout="centered"
      title="¿Guardar los cambios?"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            fullWidth
            disabled={submitting}
            onPress={onBack}
          >
            Volver
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting}
            onPress={onConfirm}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      <p className="text-center text-body text-text-subtle">
        {`${plural(assignedUsers.length, {
          one: "Se aplica a la 1 persona",
          other: `Se aplican a las ${assignedUsers.length} personas`,
        })} con el rol ${roleName}:`}
      </p>
      <div className="max-h-60 w-full shrink-0 overflow-y-auto rounded-lg border border-border text-left">
        {assignedUsers.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-2 border-border border-b px-4 py-2 last:border-b-0"
          >
            <User aria-hidden="true" className="size-icon-sm shrink-0 text-text-subtle" />
            <span>{user.name}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

type RoleSeed =
  | { kind: "new" }
  | { kind: "duplicate"; source: RoleSummary }
  | { kind: "edit"; role: RoleDetail };

function seededName(seed: RoleSeed): string {
  if (seed.kind === "duplicate") {
    return `Copia de ${roleDisplayName(seed.source)}`;
  }
  return seed.kind === "edit" ? (seed.role.name ?? "") : "";
}

function seededPermissions(seed: RoleSeed): ReadonlySet<PermissionKey> {
  if (seed.kind === "duplicate") {
    return withOneAlertView(seed.source.permissionKeys as PermissionKey[]);
  }
  return new Set(seed.kind === "edit" ? (seed.role.permissionKeys as PermissionKey[]) : []);
}

type RoleEditorFrameProps = {
  heading: string;
  saveLabel: string;
  selectedCount?: number;
  saveStatus?: LoadStatus;
  saveDisabled: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
};

function RoleEditorFrame({
  heading,
  saveLabel,
  selectedCount,
  saveStatus,
  saveDisabled,
  busy,
  onClose,
  onSave,
  children,
}: RoleEditorFrameProps) {
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
      width="editor"
      tone="info"
      icon={<Shield />}
      context="Configuración · Roles"
      title={heading}
      // closable: false also disables Escape, not just the close button.
      closable={!busy}
      bodyPadding="none"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-text-subtle text-detail">
            {selectedCount === undefined
              ? null
              : plural(selectedCount, {
                  one: "1 permiso elegido",
                  other: `${selectedCount} permisos elegidos`,
                })}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<Check />}
              {...(saveStatus ? { dataStatus: saveStatus } : {})}
              disabled={saveDisabled}
              onPress={onSave}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </Modal>
  );
}

function NoticeSlot({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-3 px-6 pt-4">{children}</div>;
}

type RoleEditorSessionProps = {
  seed: RoleSeed;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  services: RoleEditorModalServices;
};

function RoleEditorSession({
  seed,
  onClose,
  onSaved,
  onSessionEnded,
  services,
}: RoleEditorSessionProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshAccess = useRefreshAccess();
  const {
    fetchRole,
    createRole,
    editRole,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const reloadRole = useReloadRole({ fetchRole });

  const [stored, setStored] = useState(seed.kind === "edit" ? seed.role : null);
  const [name, setName] = useState(seededName(seed));
  const [selected, setSelected] = useState(seededPermissions(seed));
  const [selectedArea, setSelectedArea] = useState<PermissionArea>("cashRegister");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { run, modal: authorizationModal } = useAuthorization<CreateRoleOutcome | EditRoleOutcome>({
    actionName: "Guardar un rol",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  async function handleReload() {
    if (!stored) {
      return;
    }
    setSubmitting(true);
    const outcome = await reloadRole(stored.id);
    if (!mounted.current) {
      return;
    }
    if (outcome.kind === "ok" && outcome.value.kind === "found") {
      const fresh = outcome.value.role;
      setStored(fresh);
      setName(fresh.name ?? "");
      setSelected(new Set(fresh.permissionKeys as PermissionKey[]));
      setNameError(undefined);
      setNotice(null);
    }
    setSubmitting(false);
  }

  async function save() {
    setNotice(null);
    setSubmitting(true);

    const outcome = await run(() =>
      stored
        ? editRole(stored.id, {
            name: name.trim(),
            permissionKeys: Array.from(selected),
            version: stored.version,
          })
        : createRole({ name: name.trim(), permissionKeys: Array.from(selected) }),
    );
    if (!mounted.current) {
      return;
    }
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok") {
      onSaved();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "not_found") {
      void refreshAccess();
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "name_taken") {
      setNameError("Ya existe un rol con este nombre.");
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      setNameError(roleFieldErrorMessage(outcome.field));
      if (roleFieldErrorMessage(outcome.field) === undefined) {
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

  async function handleSubmit() {
    const error = validateRoleName(name);
    setNameError(error);
    if (error) {
      return;
    }
    if (stored && stored.assignedUsers.length > 0) {
      setConfirmingSave(true);
      return;
    }
    await save();
  }

  async function confirmSave() {
    setConfirmingSave(false);
    await save();
  }

  const heading =
    seed.kind === "edit" ? "Editar rol" : seed.kind === "duplicate" ? "Duplicar rol" : "Nuevo rol";
  const saveLabel = seed.kind === "edit" ? "Guardar los cambios" : "Guardar el rol";

  return (
    <>
      <RoleEditorFrame
        heading={heading}
        saveLabel={saveLabel}
        selectedCount={selected.size}
        saveDisabled={submitting}
        busy={submitting}
        onClose={onClose}
        onSave={() => void handleSubmit()}
      >
        {notice ? (
          <NoticeSlot>
            {notice.kind === "attemptFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo guardar el rol"
                description="Probá de nuevo."
              />
            )}
            {notice.kind === "rateLimited" && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title="Demasiadas solicitudes"
                description={retryAfterDetail(notice.retryAfterSeconds)}
              />
            )}
            {notice.kind === "staleVersion" && (
              <>
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title="Este rol cambió mientras lo editabas"
                  description="Recargá sus datos y volvé a hacer el cambio."
                />
                <Button
                  variant="secondary"
                  icon={<RotateCcw />}
                  disabled={submitting}
                  onPress={() => void handleReload()}
                >
                  Recargar
                </Button>
              </>
            )}
          </NoticeSlot>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          <RoleEditorForm
            name={name}
            onNameChange={(value) => {
              setName(value);
              if (nameError) {
                setNameError(validateRoleName(value));
              }
            }}
            {...(nameError ? { nameError } : {})}
            selected={selected}
            onSelectedChange={setSelected}
            selectedArea={selectedArea}
            onSelectedAreaChange={setSelectedArea}
          />
        </div>
      </RoleEditorFrame>
      <RoleSaveConfirmationModal
        open={confirmingSave}
        roleName={stored ? roleDisplayName(stored) : ""}
        assignedUsers={stored?.assignedUsers ?? []}
        submitting={submitting}
        onBack={() => setConfirmingSave(false)}
        onConfirm={() => void confirmSave()}
      />
      {authorizationModal}
    </>
  );
}

type EditRoleEditorProps = Omit<RoleEditorSessionProps, "seed"> & { roleId: string };

function EditRoleEditor({ roleId, services, ...handlers }: EditRoleEditorProps) {
  const data = useRoleQuery({
    roleId,
    fetchRole: services.fetchRole,
    onSessionEnded: handlers.onSessionEnded,
  });

  if (data.status === "loaded" && data.value.kind === "found") {
    return (
      <RoleEditorSession
        seed={{ kind: "edit", role: data.value.role }}
        services={services}
        {...handlers}
      />
    );
  }
  return (
    <RoleEditorFrame
      heading="Editar rol"
      saveLabel="Guardar los cambios"
      saveStatus={data.status}
      saveDisabled={data.status === "loaded"}
      busy={false}
      onClose={handlers.onClose}
      onSave={() => {}}
    >
      <NoticeSlot>
        {data.status === "loading" && <LoadingPlaceholder variant="form" fields={2} />}
        {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "este rol")} />}
        {data.status === "loaded" && (
          <InlineNotice tone="error" icon={<ShieldOff />} title="No encontramos este rol" />
        )}
      </NoticeSlot>
    </RoleEditorFrame>
  );
}

export function RoleEditorModal({
  request,
  onClose,
  onSaved,
  onSessionEnded,
  services,
}: RoleEditorModalProps) {
  const handlers = {
    onClose,
    onSaved,
    onSessionEnded,
    services: services ?? defaultRoleEditorModalServices,
  };
  if (request === null) {
    return null;
  }
  if (request.kind === "edit") {
    return <EditRoleEditor key={request.roleId} roleId={request.roleId} {...handlers} />;
  }
  return (
    <RoleEditorSession
      key={request.kind === "duplicate" ? request.source.id : "new"}
      seed={request}
      {...handlers}
    />
  );
}
