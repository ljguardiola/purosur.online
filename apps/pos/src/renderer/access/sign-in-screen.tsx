import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { Button, EmptyState, InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { ArrowRight, KeyRound, ShieldX, TriangleAlert, UsersRound, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { PinField } from "./pin-field";
import { UserPicker } from "./user-picker";

type Notice = { icon: Icon; title: string; description: string };

type Refusal = Exclude<SignInOutcome, { kind: "signed_in" }>;

type LoadedUsers =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; users: SignInUser[] };

const UNAVAILABLE_NOTICE: Notice = {
  icon: <TriangleAlert />,
  title: "No se pudo verificar el PIN",
  description: "Volvé a intentarlo en unos segundos.",
};

function noticeFor(refusal: Refusal): Notice {
  switch (refusal.kind) {
    case "wrong_pin":
      return {
        icon: <ShieldX />,
        title: "PIN incorrecto",
        description: "Revisá el PIN y volvé a escribirlo.",
      };
    case "no_register_permission":
      return {
        icon: <UserX />,
        title: "Sin permisos en la caja",
        description:
          "Tu usuario no tiene ningún permiso para usar la caja. Pedile a quien administra los usuarios que te asigne uno.",
      };
    case "unavailable":
      return UNAVAILABLE_NOTICE;
  }
}

export type SignInScreenProps = {
  loadUsers: () => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

function SignInPanel({
  loadUsers,
  signIn,
  onRetryLoading,
}: SignInScreenProps & { onRetryLoading: () => void }) {
  const headingId = useId();
  const noticeId = useId();
  const pinInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<LoadedUsers>({ status: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>();

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

  function choose(userId: string) {
    setChosen(userId);
    setPin("");
    setRefusal(undefined);
  }

  function type(digits: string) {
    setPin(digits);
    setRefusal(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || chosen === null || pin === "") {
      return;
    }
    setRefusal(undefined);
    setSubmitting(true);
    const outcome = await signIn(chosen, pin).catch((): SignInOutcome => ({ kind: "unavailable" }));
    setSubmitting(false);
    if (outcome.kind === "unavailable") {
      setRefusal(outcome);
      return;
    }
    setPin("");
    if (outcome.kind !== "signed_in") {
      setRefusal(outcome);
    }
  }

  const notice = refusal === undefined ? undefined : noticeFor(refusal);
  const pinRefused = refusal?.kind === "wrong_pin" || refusal?.kind === "no_register_permission";

  return (
    <main className="flex w-full max-w-110 flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <SessionEyebrow />
        <h1 id={headingId} className="text-display text-text-accent">
          ¿Quién abre la caja?
        </h1>
      </div>
      {loaded.status === "loading" ? <LoadingPlaceholder variant="list" items={3} /> : null}
      {loaded.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar los usuarios"
          description="Volvé a intentarlo en unos segundos."
          onRetry={onRetryLoading}
        />
      ) : null}
      {loaded.status === "loaded" && loaded.users.length === 0 ? (
        <EmptyState
          variant="blank"
          icon={<UsersRound />}
          title="No hay usuarios con PIN en esta caja"
          description="Cuando alguien elija su PIN con un código, va a aparecer acá."
        />
      ) : null}
      {loaded.status === "loaded" && loaded.users.length > 0 ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <UserPicker
            users={loaded.users}
            value={chosen}
            onChange={choose}
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
            disabled={submitting || chosen === null || pin === ""}
          >
            Entrar
          </Button>
        </form>
      ) : null}
      <ScreenLink
        to="/pin-code-redemption"
        icon={<KeyRound />}
        label="Tengo un código para cambiar el PIN"
      />
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
