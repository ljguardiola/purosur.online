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
} from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { deepEqual, useNavigate } from "@tanstack/react-router";
import {
  Eye,
  KeyRound,
  Pencil,
  Plus,
  ShieldX,
  TriangleAlert,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useAuthorization } from "./authorization-modal";
import { type BackofficeAccess, canReactivateUser } from "./backoffice-access";
import { validateEmail } from "./email-validation";
import { roleDisplayName, roleOptions } from "./role-display";
import type { fetchRoles } from "./roles-api";
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

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; users: BranchUser[] };

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
  isOpen: boolean;
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
  isOpen,
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
    if (isOpen) {
      setFirstName("");
      setEmail("");
      setRoleId(optionsRef.current?.[0].value ?? "");
      setFieldErrors({});
      setNotice(null);
      setSubmitting(false);
      setDeactivatedConflict(null);
    }
  }, [isOpen, optionsRef]);

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
        isOpen={isOpen}
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
            {...(fieldErrors.firstName
              ? { invalid: true, errorMessage: fieldErrors.firstName }
              : {})}
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
              {...(fieldErrors.roleId ? { invalid: true, errorMessage: fieldErrors.roleId } : {})}
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
            {...(fieldErrors.email
              ? { invalid: true, errorMessage: fieldErrors.email }
              : deactivatedConflict
                ? {
                    invalid: true,
                    errorMessage: `Ese correo pertenece a la cuenta desactivada de ${deactivatedConflict.name}.`,
                  }
                : {})}
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

export function UsersListScreen({
  filters,
  onFiltersChange,
  access,
  onSessionEnded,
  services,
}: UsersListScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const navigate = useNavigate();
  const {
    fetchUsers,
    fetchRoles,
    createUser,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [roles, setRoles] = useState<BranchUserRole[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const onFiltersChangeRef = useLatestRef(onFiltersChange);

  const canReadRoles = access.isAdministrator;
  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const noRolesNeeded: Awaited<ReturnType<typeof fetchRoles>> = { kind: "ok", value: [] };
    const [usersOutcome, rolesOutcome] = await Promise.all([
      fetchUsers(),
      canReadRoles ? fetchRoles() : Promise.resolve(noRolesNeeded),
    ]);
    const outcomes = [usersOutcome, rolesOutcome];
    if (outcomes.some((outcome) => outcome.kind === "unauthenticated")) {
      onSessionEndedRef.current();
      return;
    }
    const rateLimited = outcomes.flatMap((outcome) =>
      outcome.kind === "rate_limited" ? [outcome.retryAfterSeconds] : [],
    );
    if (rateLimited.length > 0) {
      setList({ kind: "rate_limited", retryAfterSeconds: Math.max(...rateLimited) });
    } else if (outcomes.some((outcome) => outcome.kind === "forbidden")) {
      sendToMyAccount();
    } else if (usersOutcome.kind === "ok" && rolesOutcome.kind === "ok") {
      setRoles(rolesOutcome.value);
      setList({ kind: "loaded", users: usersOutcome.value });
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchUsers, fetchRoles, canReadRoles, onSessionEndedRef, sendToMyAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = list.kind === "loaded" ? list.users : [];

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

  const filteredUsers = useMemo(() => {
    if (!showsState || stateFilter === "all") {
      return users;
    }
    return users.filter((user) =>
      stateFilter === "active" ? user.active !== false : user.active === false,
    );
  }, [users, showsState, stateFilter]);

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
                disabled={list.kind !== "loaded" || roles.length === 0}
                onPress={() => setModalOpen(true)}
              >
                Nuevo usuario
              </Button>
            ) : null}
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No pudimos abrir los usuarios"
              description="Probá de nuevo en unos minutos."
            />
            <Button variant="secondary" onPress={() => void load()}>
              Reintentar
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(list.retryAfterSeconds)}
            />
            <Button variant="secondary" onPress={() => void load()}>
              Reintentar
            </Button>
          </>
        )}
        {(list.kind === "loading" || list.kind === "loaded") && (
          <>
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
              loading={list.kind === "loading" ? "initial" : false}
              rows={filteredUsers.map((user) => ({ id: user.id, item: user }))}
              footer={
                <p className="text-text-subtle text-detail">
                  {plural(filteredUsers.length, {
                    one: "1 usuario",
                    other: `${filteredUsers.length} usuarios`,
                  })}
                </p>
              }
            />
          </>
        )}
      </ScreenLayout>
      <NewUserModal
        isOpen={modalOpen}
        roles={roles}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          void load();
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
