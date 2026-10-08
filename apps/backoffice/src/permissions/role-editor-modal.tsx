import {
  type PermissionCatalogWire,
  type RoleCreationBody,
  type RoleEditBody,
  roleCreationBodySchema,
  roleEditBodySchema,
} from "@purosur/contracts";
import type { PermissionArea, PermissionKey } from "@purosur/domain";
import {
  Button,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  type LoadStatus,
  Modal,
  plural,
  useRequestForm,
} from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, RotateCcw, Shield, ShieldOff, ShieldX, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import { fetchPermissionCatalog } from "../platform/permission-catalog-api";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { roleDisplayName } from "../platform/role-display-name";
import type { RoleSummary } from "../platform/roles-api";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { CloudData } from "../platform/use-cloud-query";
import { ConfirmRoleSaveModal } from "./confirm-role-save-modal";
import { withRequiredPermissions } from "./permission-catalog";
import {
  usePermissionCatalogQuery,
  useRefreshPermissions,
  useReloadRole,
  useRoleQuery,
} from "./permissions-queries";
import { RoleEditorForm } from "./role-editor-form";
import { roleNameMessage } from "./role-name-message";
import {
  type CreateRoleOutcome,
  createRole,
  type EditRoleOutcome,
  editRole,
  fetchRole,
  type RoleDetail,
} from "./roles-api";

export type RoleEditorRequest =
  | { kind: "new" }
  | { kind: "edit"; roleId: string }
  | { kind: "duplicate"; source: RoleSummary };

export type RoleEditorModalServices = {
  fetchRole: typeof fetchRole;
  fetchPermissionCatalog: typeof fetchPermissionCatalog;
  createRole: typeof createRole;
  editRole: typeof editRole;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

const defaultRoleEditorModalServices: RoleEditorModalServices = {
  fetchRole,
  fetchPermissionCatalog,
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

function seededPermissions(
  seed: RoleSeed,
  catalog: PermissionCatalogWire,
): ReadonlySet<PermissionKey> {
  if (seed.kind === "duplicate") {
    return withRequiredPermissions(catalog, seed.source.permissionKeys as PermissionKey[]);
  }
  return withRequiredPermissions(
    catalog,
    seed.kind === "edit" ? (seed.role.permissionKeys as PermissionKey[]) : [],
  );
}

const HEADINGS = {
  new: "Nuevo rol",
  duplicate: "Duplicar rol",
  edit: "Editar rol",
} satisfies Record<RoleEditorRequest["kind"], string>;

function saveLabelFor(kind: RoleEditorRequest["kind"]): string {
  return kind === "edit" ? "Guardar los cambios" : "Guardar el rol";
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
  catalog: PermissionCatalogWire;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  services: RoleEditorModalServices;
};

function RoleEditorSession({
  seed,
  catalog,
  onClose,
  onSaved,
  onSessionEnded,
  services,
}: RoleEditorSessionProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPermissions = useRefreshPermissions();
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
  const [selectedArea, setSelectedArea] = useState<PermissionArea>("cashRegister");
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const saveConfirmed = useRef(false);

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
  const { form, submit, submitting, reset, values } = useRequestForm({
    defaultValues: { name: seededName(seed), permissions: seededPermissions(seed, catalog) },
    request: {
      schema: stored ? roleEditBodySchema : roleCreationBodySchema,
      from: ({ name, permissions }): RoleCreationBody | RoleEditBody => ({
        name: name.trim(),
        permissions: Array.from(permissions),
        ...(stored ? { version: stored.version } : {}),
      }),
    },
    fields: { name: "name", permissions: null },
    messages: { name: roleNameMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (stored && stored.assignedUsers.length > 0 && !saveConfirmed.current) {
        setConfirmingSave(true);
        return;
      }
      setNotice(null);

      const outcome = await run(() =>
        stored && "version" in request ? editRole(stored.id, request) : createRole(request),
      );
      if (!mounted.current) {
        return;
      }
      if (outcome.kind === "cancelled") {
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
        void refreshPermissions();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "name_taken") {
        showFieldError("name", "Ya existe un rol con este nombre.");
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });
  const busy = submitting || reloading;

  async function handleReload() {
    if (!stored) {
      return;
    }
    setReloading(true);
    const outcome = await reloadRole(stored.id);
    if (!mounted.current) {
      return;
    }
    if (outcome.kind === "ok" && outcome.value.kind === "found") {
      const fresh = outcome.value.role;
      setStored(fresh);
      reset({
        name: fresh.name ?? "",
        permissions: withRequiredPermissions(catalog, fresh.permissionKeys as PermissionKey[]),
      });
      setNotice(null);
    }
    setReloading(false);
  }

  async function confirmSave() {
    setConfirmingSave(false);
    saveConfirmed.current = true;
    await submit();
    saveConfirmed.current = false;
  }

  return (
    <>
      <RoleEditorFrame
        heading={HEADINGS[seed.kind]}
        saveLabel={saveLabelFor(seed.kind)}
        selectedCount={values.permissions.size}
        saveDisabled={busy}
        busy={busy}
        onClose={onClose}
        onSave={() => void submit()}
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
                  disabled={busy}
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
            catalog={catalog}
            nameField={
              <form.AppField name="name">
                {(field) => <field.TextField kind="plain-text" label="Nombre del rol" required />}
              </form.AppField>
            }
            selected={values.permissions}
            onSelectedChange={(next) => form.setFieldValue("permissions", next)}
            selectedArea={selectedArea}
            onSelectedAreaChange={setSelectedArea}
          />
        </div>
      </RoleEditorFrame>
      <ConfirmRoleSaveModal
        open={confirmingSave}
        roleName={stored ? roleDisplayName(stored) : ""}
        assignedUsers={stored?.assignedUsers ?? []}
        submitting={busy}
        onBack={() => setConfirmingSave(false)}
        onConfirm={() => void confirmSave()}
      />
      {authorizationModal}
    </>
  );
}

function PendingRoleEditor({
  kind,
  data,
  onClose,
}: {
  kind: RoleEditorRequest["kind"];
  data: CloudData<unknown>;
  onClose: () => void;
}) {
  return (
    <RoleEditorFrame
      heading={HEADINGS[kind]}
      saveLabel={saveLabelFor(kind)}
      saveStatus={data.status}
      saveDisabled={data.status === "loaded"}
      busy={false}
      onClose={onClose}
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

type EditRoleEditorProps = Omit<RoleEditorSessionProps, "seed" | "catalog"> & {
  roleId: string;
  catalog: CloudData<PermissionCatalogWire>;
};

function EditRoleEditor({ roleId, catalog, services, ...handlers }: EditRoleEditorProps) {
  const data = combineCloudData(
    useRoleQuery({
      roleId,
      fetchRole: services.fetchRole,
      onSessionEnded: handlers.onSessionEnded,
    }),
    catalog,
  );

  if (data.status === "loaded" && data.value[0].kind === "found") {
    return (
      <RoleEditorSession
        seed={{ kind: "edit", role: data.value[0].role }}
        catalog={data.value[1]}
        services={services}
        {...handlers}
      />
    );
  }
  return <PendingRoleEditor kind="edit" data={data} onClose={handlers.onClose} />;
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
  const catalog = usePermissionCatalogQuery({
    fetchPermissionCatalog: handlers.services.fetchPermissionCatalog,
    onSessionEnded,
  });
  if (request === null) {
    return null;
  }
  if (request.kind === "edit") {
    return (
      <EditRoleEditor
        key={request.roleId}
        roleId={request.roleId}
        catalog={catalog}
        {...handlers}
      />
    );
  }
  if (catalog.status !== "loaded") {
    return <PendingRoleEditor kind={request.kind} data={catalog} onClose={onClose} />;
  }
  return (
    <RoleEditorSession
      key={request.kind === "duplicate" ? request.source.id : "new"}
      seed={request}
      catalog={catalog.value}
      {...handlers}
    />
  );
}
