import { Button, InlineNotice, Modal, TextField } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  Check,
  KeyRound,
  Pencil,
  RotateCcw,
  ShieldX,
  TriangleAlert,
  UserPen,
  UserX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { validateEmail } from "./emailValidation";
import { messages } from "./messages";
import { navigate } from "./router";
import { USERS_LIST_PATH } from "./settingsRoutes";
import {
  type BranchUser,
  type BranchUserRole,
  changeUserEmail,
  fetchEmailChangeChallenge,
  fetchUser,
} from "./usersApi";

export type UserDetailScreenServices = {
  fetchUser: typeof fetchUser;
  fetchEmailChangeChallenge: typeof fetchEmailChangeChallenge;
  changeUserEmail: typeof changeUserEmail;
  startAuthentication: typeof startAuthentication;
};

export const defaultUserDetailScreenServices: UserDetailScreenServices = {
  fetchUser,
  fetchEmailChangeChallenge,
  changeUserEmail,
  startAuthentication,
};

export type UserDetailScreenProps = {
  userId: string;
  /** From the session: only an Administrator sees this screen at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so this screen doesn't call the real API or WebAuthn. */
  services?: UserDetailScreenServices;
};

type DetailState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "forbidden" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; user: BranchUser };

const usersMessages = messages.settings.users;
const detailMessages = usersMessages.detail;
const modalMessages = usersMessages.editEmailModal;

function roleDisplayName(role: BranchUserRole): string {
  return role.isAdministrator ? usersMessages.administratorRoleName : (role.name ?? "");
}

const EMAIL_ERRORS = { required: modalMessages.emailRequired, invalid: modalMessages.emailInvalid };

type EditEmailModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; offersReload: boolean }
  | { kind: "staleVersion" }
  | { kind: "reloadFailed" };

type EditEmailModalProps = {
  isOpen: boolean;
  user: BranchUser;
  onClose: () => void;
  onSaved: (user: BranchUser) => void;
  onReloaded: (user: BranchUser) => void;
  onReloadRejected: (state: "notFound" | "forbidden") => void;
  onSessionEnded: () => void;
  fetchUser: typeof fetchUser;
  fetchEmailChangeChallenge: typeof fetchEmailChangeChallenge;
  startAuthentication: typeof startAuthentication;
  changeUserEmail: typeof changeUserEmail;
};

/** Changes one user's email, reauthenticating with the Administrator's own passkey and rejecting a save over a newer version. */
function EditEmailModal({
  isOpen,
  user,
  onClose,
  onSaved,
  onReloaded,
  onReloadRejected,
  onSessionEnded,
  fetchUser,
  fetchEmailChangeChallenge,
  startAuthentication,
  changeUserEmail,
}: EditEmailModalProps) {
  const [email, setEmail] = useState(user.email);
  const [version, setVersion] = useState(user.version);
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<EditEmailModalNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Read from refs, not reactive dependencies: the reset below must only run when the modal
  // opens, never again just because the parent re-rendered with a new `user` reference.
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (isOpen) {
      setEmail(userRef.current.email);
      setVersion(userRef.current.version);
      setEmailError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  async function handleSubmit() {
    const validationError = validateEmail(email, EMAIL_ERRORS);
    setEmailError(validationError);
    if (validationError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const challenge = await fetchEmailChangeChallenge(user.id);
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: challenge.retryAfterSeconds,
        offersReload: false,
      });
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

    const outcome = await changeUserEmail(
      user.id,
      { email: email.trim(), version },
      reauthentication,
    );
    if (outcome.kind === "ok") {
      onSaved(outcome.value);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "email") {
        setEmailError(modalMessages.emailInvalid);
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "email_taken") {
      setEmailError(modalMessages.emailTaken);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
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

  async function handleReload() {
    setSubmitting(true);
    const outcome = await fetchUser(user.id);
    if (outcome.kind === "ok") {
      setEmail(outcome.value.email);
      setVersion(outcome.value.version);
      setNotice(null);
      setSubmitting(false);
      onReloaded(outcome.value);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "not_found") {
      onReloadRejected("notFound");
      return;
    }
    if (outcome.kind === "forbidden") {
      onReloadRejected("forbidden");
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
      icon={<UserPen />}
      context={modalMessages.eyebrow}
      title={user.firstName}
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
            icon={<Check />}
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
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={usersMessages.rateLimitedTitle}
            detail={usersMessages.rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
        {notice?.kind === "staleVersion" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.staleVersionTitle}
            detail={modalMessages.staleVersionDetail}
          />
        )}
        {notice?.kind === "reloadFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.reloadFailedTitle}
            detail={modalMessages.attemptFailedDetail}
          />
        )}
        {(notice?.kind === "staleVersion" ||
          notice?.kind === "reloadFailed" ||
          (notice?.kind === "rateLimited" && notice.offersReload)) && (
          <Button
            variant="secondary"
            icon={<RotateCcw />}
            isDisabled={submitting}
            onPress={() => void handleReload()}
          >
            {modalMessages.reload}
          </Button>
        )}
        <TextField
          kind="plain-text"
          label={modalMessages.emailLabel}
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (emailError) {
              setEmailError(validateEmail(value, EMAIL_ERRORS));
            }
          }}
          helperText={modalMessages.emailHelper}
          required
          {...(emailError ? { invalid: true, errorMessage: emailError } : {})}
        />
        <InlineNotice tone="info" icon={<KeyRound />} detail={modalMessages.reauthNotice} />
      </div>
    </Modal>
  );
}

/** "Ver un usuario": one branch user's Datos section, with the passkey-confirmed email edit. */
export function UserDetailScreen({
  userId,
  isAdministrator,
  onSessionEnded,
  services,
}: UserDetailScreenProps) {
  const { fetchUser, fetchEmailChangeChallenge, changeUserEmail, startAuthentication } =
    services ?? defaultUserDetailScreenServices;
  const [state, setState] = useState<DetailState>(
    isAdministrator ? { kind: "loading" } : { kind: "forbidden" },
  );
  const [modalOpen, setModalOpen] = useState(false);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the user and unmount
  // an open edit modal along with what was typed in it.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await fetchUser(userId);
    if (outcome.kind === "ok") {
      setState({ kind: "loaded", user: outcome.value });
    } else if (outcome.kind === "not_found") {
      setState({ kind: "notFound" });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "rate_limited") {
      setState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      setState({ kind: "forbidden" });
    } else {
      setState({ kind: "loadError" });
    }
  }, [userId, endSession, fetchUser]);

  useEffect(() => {
    if (isAdministrator) {
      void load();
    }
  }, [isAdministrator, load]);

  const heading = state.kind === "loaded" ? state.user.firstName : detailMessages.heading;

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{detailMessages.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">{heading}</h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        {state.kind === "loading" && <p role="status">{detailMessages.loading}</p>}
        {state.kind === "notFound" && (
          <>
            <InlineNotice tone="error" icon={<UserX />} title={detailMessages.notFoundTitle} />
            <Button variant="secondary" onPress={() => navigate(USERS_LIST_PATH)}>
              {detailMessages.backToList}
            </Button>
          </>
        )}
        {state.kind === "forbidden" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={usersMessages.forbiddenTitle}
            detail={usersMessages.forbiddenDetail}
          />
        )}
        {state.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={detailMessages.loadErrorTitle}
              detail={detailMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {usersMessages.retry}
            </Button>
          </>
        )}
        {state.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={usersMessages.rateLimitedTitle}
              detail={usersMessages.rateLimitedDetail({
                minutes: Math.ceil(state.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {usersMessages.retry}
            </Button>
          </>
        )}
        {state.kind === "loaded" && (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-white p-4">
            <div className="flex items-center gap-3">
              <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">
                {detailMessages.datosHeading}
              </h2>
              <Button
                variant="secondary"
                size="small"
                icon={<Pencil />}
                onPress={() => setModalOpen(true)}
              >
                {detailMessages.editButton}
              </Button>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-1">
                <p className="font-bold text-ink-secondary text-sm">{detailMessages.roleLabel}</p>
                <p className="font-semibold text-base text-ink">
                  {roleDisplayName(state.user.role)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-bold text-ink-secondary text-sm">{detailMessages.emailLabel}</p>
                <p className="font-semibold text-base text-ink">{state.user.email}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      {state.kind === "loaded" && (
        <EditEmailModal
          isOpen={modalOpen}
          user={state.user}
          onClose={() => setModalOpen(false)}
          onSaved={(user) => {
            setState({ kind: "loaded", user });
            setModalOpen(false);
          }}
          onReloaded={(user) => setState({ kind: "loaded", user })}
          onReloadRejected={(kind) => {
            setState({ kind });
            setModalOpen(false);
          }}
          onSessionEnded={endSession}
          fetchUser={fetchUser}
          fetchEmailChangeChallenge={fetchEmailChangeChallenge}
          startAuthentication={startAuthentication}
          changeUserEmail={changeUserEmail}
        />
      )}
    </>
  );
}
