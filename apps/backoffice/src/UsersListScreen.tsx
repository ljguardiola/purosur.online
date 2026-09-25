import {
  Button,
  InlineNotice,
  Modal,
  Select,
  type SelectOption,
  Table,
  TableCellText,
  TextField,
} from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { Eye, KeyRound, Pencil, Plus, ShieldX, TriangleAlert, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import type { BackofficeAccess } from "./access";
import { validateEmail } from "./emailValidation";
import { messages } from "./messages";
import { fetchRoles } from "./rolesApi";
import { navigate } from "./router";
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { sendToMyAccount, userDetailPath } from "./settingsRoutes";
import {
  type BranchUser,
  type BranchUserRole,
  type CreateUserFieldError,
  type CreateUserOutcome,
  createUser,
  fetchUsers,
} from "./usersApi";

export type UsersListScreenServices = {
  fetchUsers: typeof fetchUsers;
  fetchRoles: typeof fetchRoles;
  createUser: typeof createUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultUsersListScreenServices: UsersListScreenServices = {
  fetchUsers,
  fetchRoles,
  createUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export type UsersListScreenProps = {
  /** From the session: hides actions this viewer can't perform (only Administrator-only today). */
  access: BackofficeAccess;
  onSessionEnded: () => void;
  /** Injected in tests so user management doesn't call the real API or WebAuthn. */
  services?: UsersListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; users: BranchUser[] };

const usersMessages = messages.settings.users;
const modalMessages = usersMessages.newUserModal;

function roleDisplayName(role: BranchUserRole): string {
  return role.isAdministrator ? usersMessages.administratorRoleName : (role.name ?? "");
}

function roleOptions(roles: BranchUserRole[]): [SelectOption<string>, ...SelectOption<string>[]] {
  const [first, ...rest] = roles.map((role) => ({ value: role.id, label: roleDisplayName(role) }));
  if (!first) {
    throw new Error("no role to offer: the signed-in Administrator is always in the list");
  }
  return [first, ...rest];
}

function validateName(value: string): string | undefined {
  return value.trim() ? undefined : modalMessages.nameRequired;
}

const EMAIL_ERRORS = { required: modalMessages.emailRequired, invalid: modalMessages.emailInvalid };

function fieldErrorMessage(field: CreateUserFieldError): string {
  if (field === "firstName") {
    return modalMessages.nameRequired;
  }
  if (field === "email") {
    return modalMessages.emailInvalid;
  }
  return modalMessages.roleRequired;
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
  onSessionEnded: () => void;
  createUser: typeof createUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

/** Creates a backoffice user, confirming with the shared passkey-authorization modal only when the cloud asks for it. */
function NewUserModal({
  isOpen,
  roles,
  onClose,
  onCreated,
  onSessionEnded,
  createUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: NewUserModalProps) {
  const options = roles.length > 0 ? roleOptions(roles) : undefined;
  // Read from a ref, not a reactive dependency: the reset below must only run when the modal
  // opens, never again just because the parent recomputed `roles` into a new array - which would
  // fight the person's own in-progress role choice while they're still filling the form.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(options?.[0].value ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<CreateUserOutcome>({
    action: "userCreate",
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
    }
  }, [isOpen]);

  async function handleSubmit() {
    const nameError = validateName(firstName);
    const emailError = validateEmail(email, EMAIL_ERRORS);
    const roleError = roleId ? undefined : modalMessages.roleRequired;
    setFieldErrors({
      ...(nameError ? { firstName: nameError } : {}),
      ...(emailError ? { email: emailError } : {}),
      ...(roleError ? { roleId: roleError } : {}),
    });
    if (nameError || emailError || roleError) {
      return;
    }
    setNotice(null);
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
      setFieldErrors((current) => ({ ...current, email: modalMessages.emailTaken }));
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
        context={modalMessages.eyebrow}
        title={modalMessages.heading}
        closable
        closeLabel={modalMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {modalMessages.cancel}
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<KeyRound />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
            >
              {modalMessages.submit}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {notice?.kind === "unknownRole" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.unknownRoleTitle}
              detail={modalMessages.unknownRoleDetail}
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={modalMessages.rateLimitedTitle}
              detail={modalMessages.rateLimitedDetail({
                minutes: Math.ceil(notice.retryAfterSeconds / 60),
              })}
            />
          )}
          <TextField
            kind="plain-text"
            label={modalMessages.nameLabel}
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
          {options && (
            <Select
              label={modalMessages.roleLabel}
              options={options}
              value={roleId}
              onChange={(value) => {
                setRoleId(value);
                setFieldErrors((current) => withFieldError(current, "roleId", undefined));
              }}
              required
              {...(fieldErrors.roleId ? { invalid: true, errorMessage: fieldErrors.roleId } : {})}
            />
          )}
          <TextField
            kind="plain-text"
            label={modalMessages.emailLabel}
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (fieldErrors.email) {
                setFieldErrors((current) =>
                  withFieldError(current, "email", validateEmail(value, EMAIL_ERRORS)),
                );
              }
            }}
            required
            {...(fieldErrors.email ? { invalid: true, errorMessage: fieldErrors.email } : {})}
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}

/**
 * "Usuarios": the branch's backoffice users, listed with their role. Open to whoever
 * `canSeeUsersArea` admits: the Administrator, who can also create users, or a role delegated
 * `deactivate_users`, who can only open each user's detail. A `forbidden` read (a role change
 * mid-session) sends the browser to Mi cuenta instead of showing a notice.
 */
export function UsersListScreen({ access, onSessionEnded, services }: UsersListScreenProps) {
  const {
    fetchUsers,
    fetchRoles,
    createUser,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services ?? defaultUsersListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [roles, setRoles] = useState<BranchUserRole[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the list and pull
  // the roles out from under an open create modal.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  // Every role is offered here, not just the ones some existing user already holds, so a role
  // that was just created with nobody in it yet can still be picked right away. Users and roles
  // load (and retry) together: the create action needs both. Only the Administrator can create a
  // user, and reading the roles is Administrator-only, so any other viewer loads the users alone.
  const needsRoles = access.isAdministrator;
  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const noRolesNeeded: Awaited<ReturnType<typeof fetchRoles>> = { kind: "ok", value: [] };
    const [usersOutcome, rolesOutcome] = await Promise.all([
      fetchUsers(),
      needsRoles ? fetchRoles() : Promise.resolve(noRolesNeeded),
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
  }, [fetchUsers, fetchRoles, needsRoles]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = list.kind === "loaded" ? list.users : [];

  const columns = [
    {
      key: "user",
      title: usersMessages.columns.user,
      render: (item: BranchUser) => (
        <TableCellText detail={item.email}>{item.firstName}</TableCellText>
      ),
    },
    {
      key: "role",
      title: usersMessages.columns.role,
      render: (item: BranchUser) => roleDisplayName(item.role),
    },
    {
      key: "passkeys",
      title: usersMessages.columns.passkeys,
      render: (item: BranchUser) => usersMessages.passkeysCount({ count: item.passkeyCount }),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: usersMessages.rowActionsLabel,
      actions: [
        (item: BranchUser) => ({
          icon: access.isAdministrator ? <Pencil /> : <Eye />,
          "aria-label": access.isAdministrator
            ? usersMessages.editAria({ name: item.firstName })
            : usersMessages.viewAria({ name: item.firstName }),
          onPress: () => navigate(userDetailPath(item.id)),
        }),
      ],
    },
  ] as const;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">{usersMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">{usersMessages.heading}</h1>
            </div>
            {access.isAdministrator && (
              <Button
                variant="primary"
                icon={<Plus />}
                isDisabled={list.kind !== "loaded" || roles.length === 0}
                onPress={() => setModalOpen(true)}
              >
                {usersMessages.newUserButton}
              </Button>
            )}
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={usersMessages.loadErrorTitle}
              detail={usersMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {usersMessages.retry}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={usersMessages.rateLimitedTitle}
              detail={usersMessages.rateLimitedDetail({
                minutes: Math.ceil(list.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {usersMessages.retry}
            </Button>
          </>
        )}
        {(list.kind === "loading" || list.kind === "loaded") && (
          <Table
            aria-label={usersMessages.heading}
            columns={columns}
            loading={list.kind === "loading" ? "initial" : false}
            rows={users.map((user) => ({ id: user.id, item: user }))}
            footer={
              <p className="text-ink-secondary text-sm">
                {usersMessages.count({ count: users.length })}
              </p>
            }
          />
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
        onSessionEnded={onSessionEnded}
        createUser={createUser}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
      />
    </>
  );
}
