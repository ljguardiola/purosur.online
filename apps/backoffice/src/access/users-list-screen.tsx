import {
  Button,
  InlineNotice,
  ListFilter,
  Modal,
  plural,
  Select,
  Table,
  TableCellText,
  Tag,
  TextField,
  tableRows,
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
import { useEffect, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { CloudData } from "../platform/use-cloud-query";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useRefreshAccess, useRolesQuery, useUsersQuery } from "./access-queries";
import { useAuthorization } from "./authorization-modal";
import { type BackofficeAccess, canReactivateUser } from "./backoffice-access";
import { validateEmail } from "./email-validation";
import { roleDisplayName, roleOptions } from "./role-display";
import type { UsersListFilters } from "./routes";
import { useSendToMyAccount } from "./send-to-my-account";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import type {
  BranchUser,
  BranchUserRole,
  CreateUserFieldError,
  CreateUserOutcome,
  createUser,
} from "./users-api";
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

const NAME_REQUIRED = "Ingresá el nombre.";
const EMAIL_REQUIRED = "Ingresá el correo.";
const EMAIL_INVALID = "Ingresá un correo válido.";

function validateName(value: string): string | undefined {
  return value.trim() ? undefined : NAME_REQUIRED;
}

const EMAIL_ERRORS = { required: EMAIL_REQUIRED, invalid: EMAIL_INVALID };

function fieldErrorMessage(field: CreateUserFieldError): string {
  if (field === "firstName") {
    return NAME_REQUIRED;
  }
  if (field === "email") {
    return EMAIL_INVALID;
  }
  return "Elegí un rol.";
}

type FormNotice =
  | { kind: "attemptFailed" }
  | { kind: "unknownRole" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type FieldErrors = { firstName?: string; email?: string; roleId?: string };
type FieldErrorKey = keyof FieldErrors;

function withFieldError(
  current: FieldErrors,
  field: FieldErrorKey,
  message: string | undefined,
): FieldErrors {
  const rest = { ...current };
  delete rest[field];
  return message !== undefined ? { ...rest, [field]: message } : rest;
}

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
  const optionsRef = useLatestRef(options);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(options?.[0].value ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deactivatedConflict, setDeactivatedConflict] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { run, modal } = useAuthorization<CreateUserOutcome>({
    actionName: "Crear un usuario",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setFirstName("");
      setEmail("");
      setRoleId(optionsRef.current?.[0].value ?? "");
      setFieldErrors({});
      setNotice(null);
      setSubmitting(false);
      setDeactivatedConflict(null);
    }
  }, [open, optionsRef]);

  async function handleSubmit() {
    const nameError = validateName(firstName);
    const emailError = validateEmail(email, EMAIL_ERRORS);
    const roleError = roleId ? undefined : "Elegí un rol.";
    setFieldErrors({
      ...(nameError ? { firstName: nameError } : {}),
      ...(emailError ? { email: emailError } : {}),
      ...(roleError ? { roleId: roleError } : {}),
    });
    if (nameError || emailError || roleError) {
      return;
    }
    setNotice(null);
    setDeactivatedConflict(null);
    setSubmitting(true);

    const outcome = await run(() =>
      createUser({ firstName: firstName.trim(), email: email.trim(), roleId }),
    );
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
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
    if (outcome.kind === "validation_failed") {
      const message = fieldErrorMessage(outcome.field);
      setFieldErrors((current) => ({ ...current, [outcome.field]: message }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "email_taken") {
      setFieldErrors((current) => ({ ...current, email: "Ya existe un usuario con este correo." }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "email_belongs_to_deactivated_user") {
      setDeactivatedConflict({ id: outcome.id, name: outcome.name });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "unknown_role") {
      setNotice({ kind: "unknownRole" });
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
              disabled={submitting || deactivatedConflict !== null}
              onPress={() => void handleSubmit()}
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
          <TextField
            kind="plain-text"
            label="Nombre"
            value={firstName}
            onChange={(value) => {
              setFirstName(value);
              if (fieldErrors.firstName) {
                setFieldErrors((current) =>
                  withFieldError(current, "firstName", validateName(value)),
                );
              }
            }}
            required
            errorMessage={fieldErrors.firstName}
          />
          {options ? (
            <Select
              label="Rol"
              options={options}
              value={roleId}
              onChange={(value) => {
                setRoleId(value);
                setFieldErrors((current) => withFieldError(current, "roleId", undefined));
              }}
              required
              errorMessage={fieldErrors.roleId}
            />
          ) : null}
          <TextField
            kind="plain-text"
            label="Correo"
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (fieldErrors.email) {
                setFieldErrors((current) =>
                  withFieldError(current, "email", validateEmail(value, EMAIL_ERRORS)),
                );
              }
              if (deactivatedConflict) {
                setDeactivatedConflict(null);
              }
            }}
            required
            errorMessage={
              fieldErrors.email ||
              (deactivatedConflict
                ? `Ese correo pertenece a la cuenta desactivada de ${deactivatedConflict.name}.`
                : undefined)
            }
          />
          {deactivatedConflict ? (
            <Button
              variant="secondary"
              size="small"
              icon={<UserCheck />}
              onPress={() => onReactivate({ id: deactivatedConflict.id })}
            >
              {`Reactivar a ${deactivatedConflict.name}`}
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
  const onFiltersChangeRef = useLatestRef(onFiltersChange);

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
      onFiltersChangeRef.current(shown);
    }
  }, [stateFilter, filters, onFiltersChangeRef]);

  const { rows, matchCount } = tableRows({
    items: users,
    id: (user) => user.id,
    filter: (user) =>
      !showsState ||
      stateFilter === "all" ||
      (stateFilter === "active" ? user.active !== false : user.active === false),
  });

  const baseColumns = [
    {
      key: "user",
      header: "Usuario",
      render: (item: BranchUser) => (
        <TableCellText description={item.email}>{item.firstName}</TableCellText>
      ),
    },
    {
      key: "role",
      header: "Rol",
      render: (item: BranchUser) => roleDisplayName(item.role),
    },
    {
      key: "passkeys",
      header: "Passkeys",
      render: (item: BranchUser) =>
        item.passkeyCount === 0
          ? "—"
          : plural(item.passkeyCount, {
              one: "1 registrada",
              other: `${item.passkeyCount} registradas`,
            }),
    },
  ] as const;
  const stateColumn = {
    key: "state",
    header: "Estado",
    render: (item: BranchUser) =>
      item.active === false ? <Tag tone="neutral">Inactivo</Tag> : null,
  } as const;
  const actionsColumn = {
    key: "actions",
    kind: "actions",
    header: "Acciones",
    actions: [
      (item: BranchUser) => ({
        icon: access.isAdministrator ? <Pencil /> : <Eye />,
        "aria-label": access.isAdministrator
          ? `Editar a ${item.firstName}`
          : `Ver a ${item.firstName}`,
        onPress: () => navigate({ to: "/settings/users/$userId", params: { userId: item.id } }),
      }),
    ],
  } as const;
  const columns = showsState
    ? ([...baseColumns, stateColumn, actionsColumn] as const)
    : ([...baseColumns, actionsColumn] as const);

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
          columns={columns}
          {...cloudTableState(data, "los usuarios")}
          rows={rows}
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
          void navigate({ to: "/settings/users/$userId", params: { userId: id } });
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
