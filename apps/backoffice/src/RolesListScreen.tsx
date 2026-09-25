import { Button, InlineNotice, Table } from "@purosur/ui";
import { Copy, Lock, Pencil, Plus, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "./messages";
import {
  RoleEditorModal,
  type RoleEditorModalServices,
  type RoleEditorRequest,
} from "./RoleEditorModal";
import { fetchRoles, type RoleSummary } from "./rolesApi";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";

export type RolesListScreenServices = {
  fetchRoles: typeof fetchRoles;
  roleEditorModal?: RoleEditorModalServices;
};

export const defaultRolesListScreenServices: RolesListScreenServices = {
  fetchRoles,
};

export type RolesListScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API. */
  services?: RolesListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; roles: RoleSummary[] };

const rolesMessages = messages.settings.roles;

function roleDisplayName(role: RoleSummary): string {
  return role.isAdministrator ? rolesMessages.administratorRoleName : (role.name ?? "");
}

function permissionsCellContent(role: RoleSummary) {
  return role.isAdministrator
    ? rolesMessages.allPermissionsLabel
    : rolesMessages.permissionsCount({ count: role.permissionKeys.length });
}

function columnsFor(openEditor: (request: RoleEditorRequest) => void) {
  return [
    {
      key: "role",
      title: rolesMessages.columns.rol,
      render: (item: RoleSummary) =>
        item.isAdministrator ? (
          <span className="flex items-center gap-1.5">
            <Lock aria-hidden="true" className="size-4" />
            {roleDisplayName(item)}
          </span>
        ) : (
          roleDisplayName(item)
        ),
    },
    {
      key: "permissions",
      title: rolesMessages.columns.permisos,
      render: (item: RoleSummary) => permissionsCellContent(item),
    },
    {
      key: "users",
      title: rolesMessages.columns.usuarios,
      render: (item: RoleSummary) => rolesMessages.usersCount({ count: item.userCount }),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: rolesMessages.rowActionsLabel,
      actions: [
        // Every row gets this one, Administrator included: duplicating it is how an ordinary role
        // starts from every permission in the catalog.
        (item: RoleSummary) => ({
          icon: <Copy />,
          "aria-label": rolesMessages.duplicateAria({ name: roleDisplayName(item) }),
          onPress: () => openEditor({ kind: "duplicate", source: item }),
        }),
        // No edit action at all on the Administrator row: it can't be edited, whatever client asks.
        (item: RoleSummary) =>
          item.isAdministrator
            ? undefined
            : {
                icon: <Pencil />,
                "aria-label": rolesMessages.editAria({ name: roleDisplayName(item) }),
                onPress: () => openEditor({ kind: "edit", roleId: item.id }),
              },
      ],
    },
  ] as const;
}

/**
 * "Roles": every role the branch has, with its permission and user counts. Reserved to the
 * Administrator: App.tsx only ever routes here for one, and a `forbidden` read (a role change mid-
 * session) sends the browser to Mi cuenta instead of showing a notice.
 */
export function RolesListScreen({ onSessionEnded, services }: RolesListScreenProps) {
  const { fetchRoles, roleEditorModal } = services ?? defaultRolesListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [editorRequest, setEditorRequest] = useState<RoleEditorRequest | null>(null);

  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the list.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const outcome = await fetchRoles();
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", roles: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchRoles]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = list.kind === "loaded" ? list.roles : [];
  const columns = columnsFor(setEditorRequest);

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
          <div className="flex flex-col justify-center">
            <p className="text-ink-secondary text-sm">{rolesMessages.breadcrumb}</p>
            <h1 className="font-bold text-2xl text-brand-blue-strong">{rolesMessages.heading}</h1>
          </div>
          <Button
            variant="primary"
            icon={<Plus />}
            onPress={() => setEditorRequest({ kind: "new" })}
          >
            {rolesMessages.newRoleButton}
          </Button>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {list.kind === "loadError" && (
        <>
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={rolesMessages.loadErrorTitle}
            detail={rolesMessages.loadErrorDetail}
          />
          <Button variant="secondary" onPress={() => void load()}>
            {rolesMessages.retry}
          </Button>
        </>
      )}
      {list.kind === "rate_limited" && (
        <>
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={rolesMessages.rateLimitedTitle}
            detail={rolesMessages.rateLimitedDetail({
              minutes: Math.ceil(list.retryAfterSeconds / 60),
            })}
          />
          <Button variant="secondary" onPress={() => void load()}>
            {rolesMessages.retry}
          </Button>
        </>
      )}
      {(list.kind === "loading" || list.kind === "loaded") && (
        <Table
          aria-label={rolesMessages.heading}
          columns={columns}
          loading={list.kind === "loading" ? "initial" : false}
          rows={roles.map((role) => ({ id: role.id, item: role }))}
          footer={
            <p className="text-ink-secondary text-sm">
              {rolesMessages.count({ count: roles.length })}
            </p>
          }
        />
      )}
      <RoleEditorModal
        request={editorRequest}
        onClose={() => setEditorRequest(null)}
        onSaved={() => {
          setEditorRequest(null);
          void load();
        }}
        onSessionEnded={onSessionEnded}
        {...(roleEditorModal ? { services: roleEditorModal } : {})}
      />
    </ScreenLayout>
  );
}
