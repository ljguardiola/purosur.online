import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { EmptyState, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { KeyRound, TriangleAlert, UserPlus, UsersRound } from "lucide-react";
import type { Ref } from "react";
import { useEffect, useId, useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { PinAttemptControls } from "./pin-attempt-controls";
import { SignInLockout } from "./sign-in-lockout";
import { usePinAttempt } from "./use-pin-attempt";
import { UserPicker } from "./user-picker";

type LoadedUsers =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; users: SignInUser[] };

export type SignInScreenProps = {
  loadUsers: () => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  registerName: string | null;
};

function SignInHeading({
  id,
  headingRef,
  children,
}: {
  id: string;
  headingRef: Ref<HTMLHeadingElement>;
  children: string;
}) {
  return (
    <h1
      id={id}
      ref={headingRef}
      tabIndex={-1}
      className="text-display text-text-accent outline-none"
    >
      {children}
    </h1>
  );
}

function SignInPanel({
  loadUsers,
  signIn,
  registerName,
  onRetryLoading,
}: SignInScreenProps & { onRetryLoading: () => void }) {
  const headingId = useId();
  const [loaded, setLoaded] = useState<LoadedUsers>({ status: "loading" });
  const [chosen, setChosen] = useState<SignInUser | null>(null);
  const attempt = usePinAttempt(
    chosen === null
      ? null
      : { id: chosen.id, firstName: chosen.first_name, attempt: (pin) => signIn(chosen.id, pin) },
  );
  const { refusal, locked, submitting } = attempt;

  useEffect(() => {
    let current = true;
    loadUsers().then(
      (users) => {
        if (current) {
          setLoaded({ status: "loaded", users });
        }
      },
      () => {
        if (current) {
          setLoaded({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [loadUsers]);

  function reset(user: SignInUser | null) {
    setChosen(user);
    attempt.reset();
  }

  return (
    <main className="flex w-full max-w-110 flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <SessionEyebrow registerName={registerName} />
        <SignInHeading id={headingId} headingRef={attempt.heading}>
          {refusal?.kind === "locked"
            ? `${refusal.firstName} está bloqueado`
            : "¿Quién abre la caja?"}
        </SignInHeading>
      </div>
      {refusal?.kind === "locked" ? (
        <SignInLockout
          consecutiveFailures={refusal.consecutiveFailures}
          backLabel="Volver a la lista de usuarios"
          onBack={() => reset(null)}
        />
      ) : null}
      {!locked && loaded.status === "loading" ? (
        <LoadingPlaceholder variant="list" items={3} />
      ) : null}
      {!locked && loaded.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar los usuarios"
          description="Volvé a intentarlo en unos segundos."
          onRetry={onRetryLoading}
        />
      ) : null}
      {!locked && loaded.status === "loaded" && loaded.users.length === 0 ? (
        <EmptyState
          variant="blank"
          icon={<UsersRound />}
          title="Todavía nadie ingresó en esta caja."
        />
      ) : null}
      {!locked && loaded.status === "loaded" && loaded.users.length > 0 ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
          <UserPicker
            users={loaded.users}
            value={chosen?.id ?? null}
            onChange={reset}
            labelledBy={headingId}
            disabled={submitting}
          />
          <PinAttemptControls
            attempt={attempt}
            pinInput={attempt.pinInput}
            disabled={chosen === null}
          />
        </form>
      ) : null}
      {locked ? null : (
        <div className="flex flex-col gap-1">
          <ScreenLink to="/first-sign-in" icon={<UserPlus />} label="Ingresar por primera vez" />
          <ScreenLink
            to="/pin-code-redemption"
            icon={<KeyRound />}
            label="Tengo un código para cambiar el PIN"
          />
        </div>
      )}
    </main>
  );
}

export function SignInScreen(props: SignInScreenProps) {
  const [attempt, setAttempt] = useState(0);

  return (
    <BrandPanelScreen>
      <SignInPanel key={attempt} {...props} onRetryLoading={() => setAttempt(attempt + 1)} />
    </BrandPanelScreen>
  );
}
