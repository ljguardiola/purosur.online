import type { PermissionArea, PermissionKey } from "@purosur/contracts";
import { Button, InlineNotice, Modal, plural } from "@purosur/ui";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
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

type LoadState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "loaded"; role: RoleDetail }
  | { kind: "notFound" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

type FormNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; offersReload: boolean }
  | { kind: "staleVersion" }
  | { kind: "reloadFailed" };

type RoleSaveConfirmationModalProps = {
  isOpen: boolean;
  roleName: string;
  assignedUsers: AssignedUser[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

function RoleSaveConfirmationModal({
  isOpen,
  roleName,
  assignedUsers,
  submitting,
  onBack,
  onConfirm,
}: RoleSaveConfirmationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
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
            isDisabled={submitting}
            onPress={onBack}
          >
            Volver
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={onConfirm}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      <p className="text-center text-base text-ink-secondary">
        {`${plural(assignedUsers.length, {
          one: "Se aplica a la 1 persona",
          other: `Se aplican a las ${assignedUsers.length} personas`,
        })} con el rol ${roleName}:`}
      </p>
      <div className="max-h-60 w-full shrink-0 overflow-y-auto rounded-lg border border-line text-left">
        {assignedUsers.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-2 border-line border-b px-4 py-2 last:border-b-0"
          >
            <User aria-hidden="true" className="size-4 shrink-0 text-ink-secondary" />
            <span>{user.name}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function RoleEditorModal({
  request,
  onClose,
  onSaved,
  onSessionEnded,
  services,
}: RoleEditorModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchRole,
    createRole,
    editRole,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services ?? defaultRoleEditorModalServices;
  const isOpen = request !== null;
  const mode = request?.kind ?? "new";

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [selectedArea, setSelectedArea] = useState<PermissionArea>("cashRegister");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "ready" });
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);

  const sessionRef = useRef(0);

  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const endSession = useCallback(() => onSessionEndedRef.current(), [onSessionEndedRef]);

  const { run, modal: authorizationModal } = useAuthorization<CreateRoleOutcome | EditRoleOutcome>({
    actionName: "Guardar un rol",
    onSessionEnded: endSession,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  const loadEditRole = useCallback(
    async (roleId: string) => {
      const session = sessionRef.current;
      setLoadState({ kind: "loading" });
      const outcome = await fetchRole(roleId);
      if (session !== sessionRef.current) {
        return;
      }
      if (outcome.kind === "ok") {
        setLoadState({ kind: "loaded", role: outcome.value });
        setName(outcome.value.name ?? "");
        setSelected(new Set(outcome.value.permissionKeys as PermissionKey[]));
        return;
      }
      if (outcome.kind === "unauthenticated") {
        endSession();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "not_found") {
        setLoadState({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "rate_limited") {
        setLoadState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setLoadState({ kind: "loadError" });
    },
    [fetchRole, endSession, sendToMyAccount],
  );

  useEffect(() => {
    sessionRef.current += 1;
    if (!request) {
      return;
    }
    setSelectedArea("cashRegister");
    setNameError(undefined);
    setNotice(null);
    setSubmitting(false);
    setConfirmingSave(false);
    if (request.kind === "new") {
      setName("");
      setSelected(new Set());
      setLoadState({ kind: "ready" });
    } else if (request.kind === "duplicate") {
      setName(`Copia de ${roleDisplayName(request.source)}`);
      setSelected(withOneAlertView(request.source.permissionKeys as PermissionKey[]));
      setLoadState({ kind: "ready" });
    } else {
      setName("");
      setSelected(new Set());
      void loadEditRole(request.roleId);
    }
  }, [request, loadEditRole]);

  async function handleReload() {
    if (request?.kind !== "edit") {
      return;
    }
    const session = sessionRef.current;
    setSubmitting(true);
    const outcome = await fetchRole(request.roleId);
    if (session !== sessionRef.current) {
      return;
    }
    if (outcome.kind === "ok") {
      setLoadState({ kind: "loaded", role: outcome.value });
      setName(outcome.value.name ?? "");
      setSelected(new Set(outcome.value.permissionKeys as PermissionKey[]));
      setNotice(null);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      endSession();
      return;
    }
    if (outcome.kind === "not_found") {
      setLoadState({ kind: "notFound" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: outcome.retryAfterSeconds,
        offersReload: true,
      });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  async function save() {
    const session = sessionRef.current;
    setNotice(null);
    setSubmitting(true);

    const outcome = await run(() =>
      request?.kind === "edit" && loadState.kind === "loaded"
        ? editRole(request.roleId, {
            name: name.trim(),
            permissionKeys: Array.from(selected),
            version: loadState.role.version,
          })
        : createRole({ name: name.trim(), permissionKeys: Array.from(selected) }),
    );
    if (session !== sessionRef.current) {
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
      endSession();
      return;
    }
    if (outcome.kind === "not_found") {
      setLoadState({ kind: "notFound" });
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
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: outcome.retryAfterSeconds,
        offersReload: false,
      });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!request || (request.kind === "edit" && loadState.kind !== "loaded")) {
      return;
    }
    const error = validateRoleName(name);
    setNameError(error);
    if (error) {
      return;
    }
    if (
      request.kind === "edit" &&
      loadState.kind === "loaded" &&
      loadState.role.assignedUsers.length > 0
    ) {
      setConfirmingSave(true);
      return;
    }
    await save();
  }

  function backFromConfirmation() {
    setConfirmingSave(false);
  }

  async function confirmSave() {
    setConfirmingSave(false);
    await save();
  }

  const heading =
    mode === "edit" ? "Editar rol" : mode === "duplicate" ? "Duplicar rol" : "Nuevo rol";
  const saveLabel = mode === "edit" ? "Guardar los cambios" : "Guardar el rol";
  const offersReload =
    notice?.kind === "staleVersion" ||
    notice?.kind === "reloadFailed" ||
    (notice?.kind === "rateLimited" && notice.offersReload);
  const formReady = loadState.kind === "ready" || loadState.kind === "loaded";
  const canSubmit = !submitting && (mode !== "edit" || loadState.kind === "loaded");
  const hasNoticeOrLoadStatus = notice !== null || !formReady;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            onClose();
          }
        }}
        width="editor"
        tone="info"
        icon={<Shield />}
        context="Configuración · Roles"
        title={heading}
        // closable: false also disables Escape, not just the close button.
        closable={!submitting}
        bodyPadding="none"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-ink-secondary text-sm">
              {plural(selected.size, {
                one: "1 permiso elegido",
                other: `${selected.size} permisos elegidos`,
              })}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" icon={<X />} isDisabled={submitting} onPress={onClose}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                icon={<Check />}
                isDisabled={!canSubmit}
                onPress={() => void handleSubmit()}
              >
                {saveLabel}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {hasNoticeOrLoadStatus && (
            <div className="flex shrink-0 flex-col gap-3 px-6 pt-4">
              {notice?.kind === "attemptFailed" && (
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title="No se pudo guardar el rol"
                  detail="Probá de nuevo."
                />
              )}
              {notice?.kind === "rateLimited" && (
                <InlineNotice
                  tone="error"
                  icon={<ShieldX />}
                  title="Demasiadas solicitudes"
                  detail={retryAfterDetail(notice.retryAfterSeconds)}
                />
              )}
              {notice?.kind === "staleVersion" && (
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title="Este rol cambió mientras lo editabas"
                  detail="Recargá sus datos y volvé a hacer el cambio."
                />
              )}
              {notice?.kind === "reloadFailed" && (
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title="No se pudieron recargar los datos"
                  detail="Probá de nuevo."
                />
              )}
              {offersReload && (
                <Button
                  variant="secondary"
                  icon={<RotateCcw />}
                  isDisabled={submitting}
                  onPress={() => void handleReload()}
                >
                  Recargar
                </Button>
              )}
              {loadState.kind === "loading" && <p role="status">Cargando…</p>}
              {loadState.kind === "notFound" && (
                <InlineNotice tone="error" icon={<ShieldOff />} title="No encontramos este rol" />
              )}
              {loadState.kind === "loadError" && (
                <>
                  <InlineNotice
                    tone="error"
                    icon={<TriangleAlert />}
                    title="No pudimos abrir este rol"
                    detail="Probá de nuevo en unos minutos."
                  />
                  <Button
                    variant="secondary"
                    onPress={() => request?.kind === "edit" && void loadEditRole(request.roleId)}
                  >
                    Reintentar
                  </Button>
                </>
              )}
              {loadState.kind === "rate_limited" && (
                <>
                  <InlineNotice
                    tone="error"
                    icon={<ShieldX />}
                    title="Demasiadas solicitudes"
                    detail={retryAfterDetail(loadState.retryAfterSeconds)}
                  />
                  <Button
                    variant="secondary"
                    onPress={() => request?.kind === "edit" && void loadEditRole(request.roleId)}
                  >
                    Reintentar
                  </Button>
                </>
              )}
            </div>
          )}
          {formReady && (
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
          )}
        </div>
      </Modal>
      <RoleSaveConfirmationModal
        isOpen={confirmingSave}
        roleName={loadState.kind === "loaded" ? roleDisplayName(loadState.role) : ""}
        assignedUsers={loadState.kind === "loaded" ? loadState.role.assignedUsers : []}
        submitting={submitting}
        onBack={backFromConfirmation}
        onConfirm={() => void confirmSave()}
      />
      {authorizationModal}
    </>
  );
}
