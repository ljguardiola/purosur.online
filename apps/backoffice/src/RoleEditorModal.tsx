import type { PermissionArea, PermissionKey } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
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
import { useAuthorization } from "./AuthorizationModal";
import { messages } from "./messages";
import { RoleEditorForm, roleFieldErrorMessage, validateRoleName } from "./RoleEditorForm";
import { failedRoleLoadStatus } from "./RoleLoadStatus";
import { withOneAlertView } from "./rolePermissions";
import {
  type AssignedUser,
  type CreateRoleOutcome,
  createRole,
  type EditRoleOutcome,
  editRole,
  fetchRole,
  type RoleDetail,
  type RoleSummary,
} from "./rolesApi";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { sendToMyAccount } from "./settingsRoutes";

const rolesMessages = messages.settings.roles;
const editorMessages = rolesMessages.roleEditorModal;

export type RoleEditorRequest =
  | { kind: "new" }
  | { kind: "edit"; roleId: string }
  /** Opened from the row already on hand, so duplicating never refetches the whole list. */
  | { kind: "duplicate"; source: RoleSummary };

export type RoleEditorModalServices = {
  fetchRole: typeof fetchRole;
  createRole: typeof createRole;
  editRole: typeof editRole;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultRoleEditorModalServices: RoleEditorModalServices = {
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

function sourceDisplayName(role: RoleSummary): string {
  return role.isAdministrator ? rolesMessages.administratorRoleName : (role.name ?? "");
}

type RoleSaveConfirmationModalProps = {
  isOpen: boolean;
  roleName: string;
  assignedUsers: AssignedUser[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

/**
 * "¿Guardar los cambios?": the confirmation step an edit with people assigned opens before any
 * other authorization, listing everyone the change applies to. "Volver" returns to the editor
 * with its edits untouched; "Guardar los cambios" here proceeds with the normal save (and its own
 * passkey step-up, if the session needs one).
 */
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
      title={editorMessages.confirmTitle}
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
            {editorMessages.back}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={onConfirm}
          >
            {rolesMessages.editRole.save}
          </Button>
        </>
      }
    >
      <p className="text-center text-base text-ink-secondary">
        {editorMessages.confirmText({ count: assignedUsers.length, roleName })}
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

/**
 * "Nuevo rol" / "Editar rol" / "Duplicar rol": one modal over the Roles list for all three,
 * organized by permission area. Edit loads the role fresh (for its version and assigned people);
 * duplicate pre-fills from the row already on hand. Saving is gated by the shared passkey-
 * authorization window, and an edit keeps its optimistic-locking / stale-version reload behavior.
 */
export function RoleEditorModal({
  request,
  onClose,
  onSaved,
  onSessionEnded,
  services,
}: RoleEditorModalProps) {
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

  // Bumped whenever the request changes, so a fetch started for an earlier request (one since
  // closed or replaced by another) knows its late response no longer belongs here.
  const sessionRef = useRef(0);

  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);

  const { run, modal: authorizationModal } = useAuthorization<CreateRoleOutcome | EditRoleOutcome>({
    action: "roleSave",
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
      setLoadState(failedRoleLoadStatus(outcome));
    },
    [fetchRole, endSession],
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
      setName(
        rolesMessages.duplicateRole.nameFromOriginal({ name: sourceDisplayName(request.source) }),
      );
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
      setNameError(rolesMessages.form.nameTaken);
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
    mode === "edit"
      ? rolesMessages.editRole.heading
      : mode === "duplicate"
        ? rolesMessages.duplicateRole.heading
        : rolesMessages.newRole.heading;
  const saveLabel = mode === "edit" ? rolesMessages.editRole.save : rolesMessages.roleCreation.save;
  const offersReload =
    notice?.kind === "staleVersion" ||
    notice?.kind === "reloadFailed" ||
    (notice?.kind === "rateLimited" && notice.offersReload);
  const formReady = loadState.kind === "ready" || loadState.kind === "loaded";
  const canSubmit = !submitting && (mode !== "edit" || loadState.kind === "loaded");
  // Notices and the load status are transient banners, not part of the design's edge-to-edge name
  // row and panes, so they keep their own inset padding instead of the flush body's none.
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
        context={editorMessages.eyebrow}
        title={heading}
        // A save in flight can't be dismissed, like Cancelar: no close button and no Escape.
        {...(submitting
          ? { closable: false }
          : { closable: true, closeLabel: editorMessages.closeLabel })}
        bodyPadding="none"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-ink-secondary text-sm">
              {editorMessages.selectedCount({ count: selected.size })}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" icon={<X />} isDisabled={submitting} onPress={onClose}>
                {rolesMessages.rolePage.cancel}
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
                  title={rolesMessages.editRole.attemptFailedTitle}
                  detail={rolesMessages.rolePage.attemptFailedDetail}
                />
              )}
              {notice?.kind === "rateLimited" && (
                <InlineNotice
                  tone="error"
                  icon={<ShieldX />}
                  title={rolesMessages.rateLimitedTitle}
                  detail={rolesMessages.rateLimitedDetail({
                    minutes: Math.ceil(notice.retryAfterSeconds / 60),
                  })}
                />
              )}
              {notice?.kind === "staleVersion" && (
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title={rolesMessages.editRole.staleVersionTitle}
                  detail={rolesMessages.editRole.staleVersionDetail}
                />
              )}
              {notice?.kind === "reloadFailed" && (
                <InlineNotice
                  tone="error"
                  icon={<TriangleAlert />}
                  title={rolesMessages.editRole.reloadFailedTitle}
                  detail={rolesMessages.rolePage.attemptFailedDetail}
                />
              )}
              {offersReload && (
                <Button
                  variant="secondary"
                  icon={<RotateCcw />}
                  isDisabled={submitting}
                  onPress={() => void handleReload()}
                >
                  {rolesMessages.editRole.reload}
                </Button>
              )}
              {loadState.kind === "loading" && (
                <p role="status">{rolesMessages.roleLoad.loading}</p>
              )}
              {loadState.kind === "notFound" && (
                <InlineNotice
                  tone="error"
                  icon={<ShieldOff />}
                  title={rolesMessages.roleLoad.notFoundTitle}
                />
              )}
              {loadState.kind === "loadError" && (
                <>
                  <InlineNotice
                    tone="error"
                    icon={<TriangleAlert />}
                    title={rolesMessages.roleLoad.loadErrorTitle}
                    detail={rolesMessages.roleLoad.loadErrorDetail}
                  />
                  <Button
                    variant="secondary"
                    onPress={() => request?.kind === "edit" && void loadEditRole(request.roleId)}
                  >
                    {rolesMessages.retry}
                  </Button>
                </>
              )}
              {loadState.kind === "rate_limited" && (
                <>
                  <InlineNotice
                    tone="error"
                    icon={<ShieldX />}
                    title={rolesMessages.rateLimitedTitle}
                    detail={rolesMessages.rateLimitedDetail({
                      minutes: Math.ceil(loadState.retryAfterSeconds / 60),
                    })}
                  />
                  <Button
                    variant="secondary"
                    onPress={() => request?.kind === "edit" && void loadEditRole(request.roleId)}
                  >
                    {rolesMessages.retry}
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
        roleName={loadState.kind === "loaded" ? sourceDisplayName(loadState.role) : ""}
        assignedUsers={loadState.kind === "loaded" ? loadState.role.assignedUsers : []}
        submitting={submitting}
        onBack={backFromConfirmation}
        onConfirm={() => void confirmSave()}
      />
      {authorizationModal}
    </>
  );
}
