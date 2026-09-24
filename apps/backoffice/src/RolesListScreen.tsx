import { Button, InlineNotice, Table } from "@purosur/ui";
import { Lock, Plus, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "./messages";
import { fetchRoles, type RoleSummary } from "./rolesApi";
import { navigate } from "./router";
import { NEW_ROLE_PATH } from "./settingsRoutes";

export type RolesListScreenServices = {
  fetchRoles: typeof fetchRoles;
};

export const defaultRolesListScreenServices: RolesListScreenServices = {
  fetchRoles,
};

export type RolesListScreenProps = {
  /** From the session: only an Administrator sees the list at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API. */
  services?: RolesListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "forbidden" }
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

const columns = [
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
] as const;

/** "Roles": every role the branch has, with its permission and user counts, Administrator only. */
export function RolesListScreen({
  isAdministrator,
  onSessionEnded,
  services,
}: RolesListScreenProps) {
  const { fetchRoles } = services ?? defaultRolesListScreenServices;
  const [list, setList] = useState<ListState>(
    isAdministrator ? { kind: "loading" } : { kind: "forbidden" },
  );

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
      setList({ kind: "forbidden" });
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchRoles]);

  useEffect(() => {
    if (isAdministrator) {
      void load();
    }
  }, [isAdministrator, load]);

  const roles = list.kind === "loaded" ? list.roles : [];

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{rolesMessages.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">{rolesMessages.heading}</h1>
        </div>
        <Button variant="primary" icon={<Plus />} onPress={() => navigate(NEW_ROLE_PATH)}>
          {rolesMessages.newRoleButton}
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        {list.kind === "forbidden" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={rolesMessages.forbiddenTitle}
            detail={rolesMessages.forbiddenDetail}
          />
        )}
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
      </div>
    </>
  );
}
