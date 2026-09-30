import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { Button, EmptyState, InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { ArrowRight, KeyRound, ShieldX, TriangleAlert, UsersRound, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useCountdown } from "../platform/use-countdown";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { waitDescription } from "./pin-attempt-text";
import { PinField } from "./pin-field";
import { SignInLockout } from "./sign-in-lockout";
import { UserPicker } from "./user-picker";

type Notice = { icon: Icon; title: string; description: string };

type Refusal =
  | Exclude<SignInOutcome, { kind: "signed_in" | "locked" }>
  | { kind: "locked"; firstName: string; consecutiveFailures: number };

type Wait = { seconds: number };

type LoadedUsers =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; users: SignInUser[] };

const UNAVAILABLE_NOTICE: Notice = {
  icon: <TriangleAlert />,
  title: "No se pudo verificar el PIN",
  description: "Volvé a intentarlo en unos segundos.",
};

function noticeFor(refusal: Refusal, secondsLeft: number): Notice | undefined {
  switch (refusal.kind) {
    case "wrong_pin":
      return {
        icon: <ShieldX />,
        title: "PIN incorrecto",
        description: waitDescription(secondsLeft, refusal.attempts_left),
      };
    case "rate_limited":
      return secondsLeft === 0
        ? undefined
        : {
            icon: <ShieldX />,
            title: "Todavía no se puede volver a intentar",
            description: waitDescription(secondsLeft, refusal.attempts_left),
          };
    case "no_register_permission":
      return {
        icon: <UserX />,
        title: "Sin permisos en la caja",
        description:
          "Tu usuario no tiene ningún permiso para usar la caja. Pedile a quien administra los usuarios que te asigne uno.",
      };
    case "locked":
      return undefined;
    case "unavailable":
      return UNAVAILABLE_NOTICE;
  }
}

export type SignInScreenProps = {
  loadUsers: () => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  registerName: string | null;
};

function SignInPanel({
  loadUsers,
  signIn,
  registerName,
  onRetryLoading,
}: SignInScreenProps & { onRetryLoading: () => void }) {
  const headingId = useId();
  const noticeId = useId();
  const pinInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const wasLocked = useRef(false);
  const [loaded, setLoaded] = useState<LoadedUsers>({ status: "loading" });
  const [chosen, setChosen] = useState<SignInUser | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>();
  const [wait, setWait] = useState<Wait>();
  const secondsLeft = useCountdown(wait);
  const locked = refusal?.kind === "locked";

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

  useEffect(() => {
    if (chosen !== null) {
      pinInput.current?.focus();
    }
  }, [chosen]);

  useEffect(() => {
    if (!submitting && refusal !== undefined) {
      pinInput.current?.focus();
    }
  }, [submitting, refusal]);

  useEffect(() => {
    if (locked !== wasLocked.current) {
      wasLocked.current = locked;
      heading.current?.focus();
    }
  }, [locked]);

  function reset(user: SignInUser | null) {
    setChosen(user);
    setPin("");
    setRefusal(undefined);
    setWait(undefined);
  }

  function type(digits: string) {
    setPin(digits);
    if (secondsLeft === 0) {
      setRefusal(undefined);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || secondsLeft > 0 || chosen === null || pin === "") {
      return;
    }
    setRefusal(undefined);
    setSubmitting(true);
    const outcome = await signIn(chosen.id, pin).catch(
      (): SignInOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    if (outcome.kind === "unavailable") {
      setRefusal(outcome);
      return;
    }
    setPin("");
    if (outcome.kind === "locked") {
      setRefusal({
        kind: "locked",
        firstName: chosen.first_name,
        consecutiveFailures: outcome.consecutive_failures,
      });
    } else if (outcome.kind !== "signed_in") {
      setRefusal(outcome);
    }
    if (
      (outcome.kind === "wrong_pin" || outcome.kind === "rate_limited") &&
      outcome.retry_after_seconds > 0
    ) {
      setWait({ seconds: outcome.retry_after_seconds });
    }
  }

  const notice = refusal === undefined ? undefined : noticeFor(refusal, secondsLeft);
  const pinRefused = notice !== undefined && refusal?.kind !== "unavailable";

  return (
    <main className="flex w-full max-w-110 flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <SessionEyebrow registerName={registerName} />
        <h1
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-display text-text-accent outline-none"
        >
          {refusal?.kind === "locked"
            ? `${refusal.firstName} está bloqueado`
            : "¿Quién abre la caja?"}
        </h1>
      </div>
      {refusal?.kind === "locked" ? (
        <SignInLockout
          consecutiveFailures={refusal.consecutiveFailures}
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
          title="No hay usuarios con PIN en esta caja"
          description="Cuando alguien elija su PIN con un código, va a aparecer acá."
        />
      ) : null}
      {!locked && loaded.status === "loaded" && loaded.users.length > 0 ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <UserPicker
            users={loaded.users}
            value={chosen?.id ?? null}
            onChange={reset}
            labelledBy={headingId}
            disabled={submitting}
          />
          <PinField
            ref={pinInput}
            value={pin}
            onChange={type}
            disabled={submitting || chosen === null}
            {...(pinRefused ? { errorMessageId: noticeId } : {})}
          />
          {notice === undefined ? null : (
            <div id={noticeId}>
              <InlineNotice
                tone="error"
                icon={notice.icon}
                title={notice.title}
                description={notice.description}
              />
            </div>
          )}
          <Button
            type="submit"
            fullWidth
            icon={<ArrowRight />}
            disabled={submitting || secondsLeft > 0 || chosen === null || pin === ""}
          >
            {secondsLeft > 0 ? `Entrar en ${secondsLeft} s` : "Entrar"}
          </Button>
        </form>
      ) : null}
      {locked ? null : (
        <ScreenLink
          to="/pin-code-redemption"
          icon={<KeyRound />}
          label="Tengo un código para cambiar el PIN"
        />
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
