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
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound, Pencil, Plus, ShieldX, TriangleAlert, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { validateEmail } from "./emailValidation";
import { messages } from "./messages";
import { navigate } from "./router";
import { userDetailPath } from "./settingsRoutes";
import {
  type BranchUser,
  type BranchUserRole,
  type CreateUserFieldError,
  createUser,
  fetchUserCreationChallenge,
  fetchUsers,
} from "./usersApi";

export type UsersListScreenServices = {
  fetchUsers: typeof fetchUsers;
  fetchUserCreationChallenge: typeof fetchUserCreationChallenge;
  createUser: typeof createUser;
  startAuthentication: typeof startAuthentication;
};

export const defaultUsersListScreenServices: UsersListScreenServices = {
  fetchUsers,
  fetchUserCreationChallenge,
  createUser,
  startAuthentication,
};

export type UsersListScreenProps = {
  /** From the session (issue #247): only an Administrator sees the list at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so user management doesn't call the real API or WebAuthn. */
  services?: UsersListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "forbidden" }
  | { kind: "loaded"; users: BranchUser[] };

const usersMessages = messages.settings.users;
const modalMessages = usersMessages.newUserModal;

function roleDisplayName(role: BranchUserRole): string {
  return role.isAdministrator ? usersMessages.administratorRoleName : (role.name ?? "");
}

function distinctRoles(users: BranchUser[]): BranchUserRole[] {
  const byId = new Map<string, BranchUserRole>();
  for (const user of users) {
    if (!byId.has(user.role.id)) {
      byId.set(user.role.id, user.role);
    }
  }
  return [...byId.values()];
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
  fetchUserCreationChallenge: typeof fetchUserCreationChallenge;
  startAuthentication: typeof startAuthentication;
  createUser: typeof createUser;
};

/** Creates a backoffice user, reauthenticating with the Administrator's own existing passkey first (issue #247). */
function NewUserModal({
  isOpen,
  roles,
  onClose,
  onCreated,
  onSessionEnded,
  fetchUserCreationChallenge,
  startAuthentication,
  createUser,
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

    const challenge = await fetchUserCreationChallenge();
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: challenge.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    if (challenge.kind !== "ok") {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const outcome = await createUser(
      { firstName: firstName.trim(), email: email.trim(), roleId },
      reauthentication,
    );
    if (outcome.kind === "ok") {
      onCreated();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
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
          {...(fieldErrors.firstName ? { invalid: true, errorMessage: fieldErrors.firstName } : {})}
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
          helperText={modalMessages.emailHelper}
          required
          {...(fieldErrors.email ? { invalid: true, errorMessage: fieldErrors.email } : {})}
        />
        <p className="text-sm text-ink-secondary">{modalMessages.reauthNotice}</p>
      </div>
    </Modal>
  );
}

/** "Usuarios": the branch's backoffice users, listed with their role, Administrator only (issue #247). */
export function UsersListScreen({
  isAdministrator,
  onSessionEnded,
  services,
}: UsersListScreenProps) {
  const { fetchUsers, fetchUserCreationChallenge, createUser, startAuthentication } =
    services ?? defaultUsersListScreenServices;
  const [list, setList] = useState<ListState>(
    isAdministrator ? { kind: "loading" } : { kind: "forbidden" },
  );
  const [modalOpen, setModalOpen] = useState(false);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the list and pull
  // the roles out from under an open create modal.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const outcome = await fetchUsers();
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", users: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      setList({ kind: "forbidden" });
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchUsers]);

  useEffect(() => {
    if (isAdministrator) {
      void load();
    }
  }, [isAdministrator, load]);

  const users = list.kind === "loaded" ? list.users : [];
  const roles = distinctRoles(users);

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
      key: "actions",
      kind: "actions",
      srLabel: usersMessages.rowActionsLabel,
      actions: [
        (item: BranchUser) => ({
          icon: <Pencil />,
          "aria-label": usersMessages.editAria({ name: item.firstName }),
          onPress: () => navigate(userDetailPath(item.id)),
        }),
      ],
    },
  ] as const;

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{usersMessages.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">{usersMessages.heading}</h1>
        </div>
        <Button
          variant="primary"
          icon={<Plus />}
          isDisabled={list.kind !== "loaded" || roles.length === 0}
          onPress={() => setModalOpen(true)}
        >
          {usersMessages.newUserButton}
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        {list.kind === "forbidden" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={usersMessages.forbiddenTitle}
            detail={usersMessages.forbiddenDetail}
          />
        )}
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
      </div>
      <NewUserModal
        isOpen={modalOpen}
        roles={roles}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          void load();
        }}
        onSessionEnded={onSessionEnded}
        fetchUserCreationChallenge={fetchUserCreationChallenge}
        startAuthentication={startAuthentication}
        createUser={createUser}
      />
    </>
  );
}
