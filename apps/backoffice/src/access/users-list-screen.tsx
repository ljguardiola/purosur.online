import { userCreationBodySchema } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  InlineNotice,
  ListFilter,
  Modal,
  plural,
  Table,
  TableCellText,
  Tag,
  useRequestForm,
  useTableModel,
} from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { deepEqual, useNavigate } from "@tanstack/react-router";
import {
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldX,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { CloudData } from "../platform/use-cloud-query";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useRefreshAccess, useRolesQuery, useUsersQuery } from "./access-queries";
import { type BackofficeAccess, canReactivateUser } from "./backoffice-access";
import { userEmailMessage } from "./email-field-message";
import { roleDisplayName, roleOptions } from "./role-display";
import { roleFieldMessage } from "./role-field-message";
import type { UsersListFilters } from "./routes";
import type { BranchUser, BranchUserRole, CreateUserOutcome, createUser } from "./users-api";
import type { UsersListScreenServices } from "./users-list-services";

export type UsersListScreenProps = {
  filters: UsersListFilters;
  onFiltersChange: (filters: UsersListFilters) => void;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: UsersListScreenServices;
};

const NO_USERS: BranchUser[] = [];
const NO_ROLES: BranchUserRole[] = [];

const EMAIL_MESSAGE = userEmailMessage(userCreationBodySchema.shape.email);

function firstNameMessage({ firstName }: { firstName: string }): string {
  return firstName.trim() === "" ? "Ingresá el nombre." : "Revisá el nombre.";
}

type FormNotice =
  | { kind: "attemptFailed" }
  | { kind: "unknownRole" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type NewUserModalProps = {
  open: boolean;
  roles: BranchUserRole[];
  onClose: () => void;
  onCreated: () => void;
  onReactivate: (target: { id: string }) => void;
  onSessionEnded: () => void;
  createUser: typeof createUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function NewUserModal({
  open,
  roles,
  onClose,
  onCreated,
  onReactivate,
  onSessionEnded,
  createUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: NewUserModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const options = roles.length > 0 ? roleOptions(roles) : undefined;
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [deactivatedConflict, setDeactivatedConflict] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const { run, modal } = useAuthorization<CreateUserOutcome>({
    actionName: "Crear un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset, values } = useRequestForm({
    defaultValues: { firstName: "", email: "", roleId: options?.[0].value ?? "" },
    request: {
      schema: userCreationBodySchema,
      from: ({ firstName, email, roleId }) => ({
        first_name: firstName.trim(),
        email: email.trim(),
        role_id: roleId,
      }),
    },
    fields: { first_name: "firstName", email: "email", role_id: "roleId" },
    messages: { firstName: firstNameMessage, email: EMAIL_MESSAGE, roleId: roleFieldMessage },
    onSubmit: async (request, { values, showWireFieldError, showFieldError }) => {
      setNotice(null);
      setDeactivatedConflict(null);
      const outcome = await run(() => createUser(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onCreated();
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "email_taken") {
        showFieldError("email", "Ya existe un usuario con este correo.");
        return;
      }
      if (outcome.kind === "email_belongs_to_deactivated_user") {
        setDeactivatedConflict({ id: outcome.id, name: outcome.name, email: values.email });
        showFieldError("email", `Ese correo pertenece a la cuenta desactivada de ${outcome.name}.`);
        return;
      }
      if (outcome.kind === "unknown_role") {
        setNotice({ kind: "unknownRole" });
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });
  const conflict = deactivatedConflict?.email === values.email ? deactivatedConflict : null;

  const startNewUser = useEffectEvent(() => {
    reset({ firstName: "", email: "", roleId: options?.[0].value ?? "" });
    setNotice(null);
    setDeactivatedConflict(null);
  });

  useEffect(() => {
    if (open) {
      startNewUser();
    }
  }, [open]);

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<UserPlus />}
        context="Configuración · Usuarios"
        title="Nuevo usuario"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              disabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<KeyRound />}
              fullWidth
              disabled={submitting || conflict !== null}
              onPress={() => void submit()}
            >
              Crear el usuario
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo crear el usuario"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "unknownRole" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Ese rol ya no está disponible"
              description="Cerrá esta ventana y volvé a intentarlo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          <form.AppField name="firstName">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          {options ? (
            <form.AppField name="roleId">
              {(field) => <field.Select label="Rol" options={options} required />}
            </form.AppField>
          ) : null}
          <form.AppField name="email">
            {(field) => <field.TextField kind="plain-text" label="Correo" required />}
          </form.AppField>
          {conflict ? (
            <Button
              variant="secondary"
              size="small"
              icon={<UserCheck />}
              onPress={() => onReactivate({ id: conflict.id })}
            >
              {`Reactivar a ${conflict.name}`}
            </Button>
          ) : null}
        </div>
      </Modal>
      {modal}
    </>
  );
}

export function UsersListScreen(props: UsersListScreenProps) {
  return props.access.isAdministrator ? (
    <AdministratorUsersList {...props} />
  ) : (
    <ReaderUsersList {...props} />
  );
}

function AdministratorUsersList(props: UsersListScreenProps) {
  const { fetchUsers, fetchRoles } = props.services;
  const { onSessionEnded } = props;
  const data = combineCloudData(
    useUsersQuery({ fetchUsers, onSessionEnded }),
    useRolesQuery({ fetchRoles, onSessionEnded }),
  );
  const [users, roles] = data.status === "loaded" ? data.value : [NO_USERS, NO_ROLES];
  return <UsersListView {...props} data={data} users={users} roles={roles} />;
}

function ReaderUsersList(props: UsersListScreenProps) {
  const { fetchUsers } = props.services;
  const data = useUsersQuery({ fetchUsers, onSessionEnded: props.onSessionEnded });
  return (
    <UsersListView
      {...props}
      data={data}
      users={data.status === "loaded" ? data.value : NO_USERS}
      roles={NO_ROLES}
    />
  );
}

type UsersListViewProps = UsersListScreenProps & {
  data: CloudData<unknown>;
  users: BranchUser[];
  roles: BranchUserRole[];
};

function UsersListView({
  filters,
  onFiltersChange,
  access,
  onSessionEnded,
  services,
  data,
  users,
  roles,
}: UsersListViewProps) {
  const navigate = useNavigate();
  const { createUser, fetchSessionAuthorizationOptions, authorizeSession, startAuthentication } =
    services;
  const refreshAccess = useRefreshAccess();
  const [modalOpen, setModalOpen] = useState(false);
  const reportFilters = useEffectEvent(onFiltersChange);

  // The cloud only ever returns a deactivated user to a caller who can reactivate one.
  const showsState = canReactivateUser(access);
  const stateFilterOptions = [
    { value: "all" as const, label: "Activos e inactivos" },
    { value: "active" as const, label: "Activos" },
    { value: "inactive" as const, label: "Inactivos" },
  ] as const;
  const [stateFilter, setStateFilter] = useState(filters.state);

  useEffect(() => {
    const shown: UsersListFilters = { state: stateFilter };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [stateFilter, filters]);

  const baseColumns = [
    dataColumn({
      id: "user",
      header: "Usuario",
      render: (item: BranchUser) => (
        <TableCellText description={item.email}>{item.firstName}</TableCellText>
      ),
    }),
    dataColumn({
      id: "role",
      header: "Rol",
      render: (item: BranchUser) => roleDisplayName(item.role),
    }),
    dataColumn({
      id: "passkeys",
      header: "Passkeys",
      render: (item: BranchUser) =>
        item.passkeyCount === 0
          ? "—"
          : plural(item.passkeyCount, {
              one: "1 registrada",
              other: `${item.passkeyCount} registradas`,
            }),
    }),
  ] as const;
  const stateColumn = dataColumn({
    id: "state",
    header: "Estado",
    render: (item: BranchUser) =>
      item.active === false ? <Tag tone="neutral">Inactivo</Tag> : null,
  });
  const rowActionsColumn = actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (item: BranchUser) => ({
        icon: access.isAdministrator ? <Pencil /> : <Eye />,
        "aria-label": access.isAdministrator
          ? `Editar a ${item.firstName}`
          : `Ver a ${item.firstName}`,
        onPress: () => navigate({ to: "/users/$userId", params: { userId: item.id } }),
      }),
    ],
  });
  const columns = showsState
    ? ([...baseColumns, stateColumn, rowActionsColumn] as const)
    : ([...baseColumns, rowActionsColumn] as const);

  const table = useTableModel({
    items: users,
    id: (user) => user.id,
    filter: (user) =>
      !showsState ||
      stateFilter === "all" ||
      (stateFilter === "active" ? user.active !== false : user.active === false),
    columns,
  });
  const matchCount = table.getRowModel().rows.length;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración</p>
              <ScreenTitle>Usuarios</ScreenTitle>
            </div>
            {access.isAdministrator ? (
              <Button
                variant="primary"
                icon={<Plus />}
                dataStatus={data.status}
                onPress={() => setModalOpen(true)}
              >
                Nuevo usuario
              </Button>
            ) : null}
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {showsState && (
          <div className="flex items-center gap-3">
            <ListFilter
              label="Estado:"
              options={stateFilterOptions}
              value={stateFilter}
              onChange={setStateFilter}
            />
          </div>
        )}
        <Table
          aria-label="Usuarios"
          table={table}
          {...cloudTableState(data, "los usuarios")}
          empty={
            users.length === 0
              ? {
                  icon: <Users />,
                  title: "Todavía no hay usuarios",
                  description: "Los usuarios que se creen van a aparecer acá.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro estado.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(matchCount, {
                  one: "1 usuario",
                  other: `${matchCount} usuarios`,
                })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewUserModal
        open={modalOpen}
        roles={roles}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          void refreshAccess();
        }}
        onReactivate={({ id }) => {
          setModalOpen(false);
          void navigate({ to: "/users/$userId", params: { userId: id } });
        }}
        onSessionEnded={onSessionEnded}
        createUser={createUser}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
      />
    </>
  );
}
