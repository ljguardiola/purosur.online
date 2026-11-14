import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import {
  Button,
  EmptyState,
  LoadFailure,
  LoadingPlaceholder,
  sortedItems,
  textOrder,
  UserSelect,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { CircleX, KeyRound, Lock, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import type { SignInUsers } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import { PinAttemptControls } from "../platform/pin-attempt-controls";
import { SignInLockout } from "../platform/sign-in-lockout";
import { usePinAttempt } from "../platform/use-pin-attempt";
import { BrandPanelCard } from "../shell/brand-panel-card";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { useSignInUsersQuery } from "./sessions-queries";

export type SignInScreenProps = {
  loadUsers: () => Promise<SignInUsers>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

function alphabetically(users: readonly SignInUser[]): SignInUser[] {
  return sortedItems(users, {
    order: textOrder((user: SignInUser) => user.first_name),
    direction: "ascending",
  });
}

function ChangePinLink() {
  return (
    <ScreenLink
      to="/pin-code-redemption"
      icon={<KeyRound />}
      label="Cambiar PIN con código"
      keycap="F3"
    />
  );
}

function SignInLinks() {
  return (
    <div className="flex flex-col gap-1">
      <ScreenLink to="/first-sign-in" icon={<UserPlus />} label="Primer ingreso" keycap="F2" />
      <ChangePinLink />
    </div>
  );
}

function NobodyListed() {
  const navigate = useNavigate();

  return (
    <>
      <EmptyState
        variant="blank"
        icon={<UsersRound />}
        title="Todavía nadie ingresó en esta caja."
      />
      <Button
        fullWidth
        icon={<UserPlus />}
        iconPosition="start"
        keycap="F2"
        onPress={() => navigate({ to: "/first-sign-in" })}
      >
        Primer ingreso
      </Button>
      <ChangePinLink />
    </>
  );
}

function SignInPanel({ loadUsers, signIn }: SignInScreenProps) {
  const navigate = useNavigate();
  const users = useSignInUsersQuery(loadUsers);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const roster = users.status === "loaded" ? users.value : null;
  const people = roster === null ? [] : alphabetically(roster.users);
  const chosen =
    people.find((person) => person.id === chosenId) ??
    people.find((person) => person.id === roster?.last_active_user_id) ??
    people[0] ??
    null;
  const attempt = usePinAttempt(
    chosen === null
      ? null
      : {
          id: chosen.id,
          firstName: chosen.first_name,
          attempt: (pin) => signIn(chosen.id, pin),
        },
  );
  const { refusal, locked, submitting } = attempt;

  function choose(id: string) {
    setChosenId(id);
    attempt.reset();
  }

  function move(step: 1 | -1) {
    const current = people.findIndex((person) => person.id === chosen?.id);
    const next = people[Math.min(people.length - 1, Math.max(0, current + step))];
    if (next !== undefined && next.id !== chosen?.id) {
      choose(next.id);
    }
  }

  useKeys([
    {
      key: "ArrowUpDown",
      run: (pressed) => move(pressed === "ArrowDown" ? 1 : -1),
      enabled: people.length > 0 && !submitting && !locked,
    },
    { key: "F2", run: () => void navigate({ to: "/first-sign-in" }), enabled: !locked },
    { key: "F3", run: () => void navigate({ to: "/pin-code-redemption" }) },
    {
      key: "R",
      run: () => {
        if (users.status === "failed") {
          users.retry();
        }
      },
      enabled: users.status === "failed",
    },
    { key: "Escape", run: attempt.reset, enabled: locked },
  ]);

  if (refusal?.kind === "locked") {
    return (
      <BrandPanelCard
        icon={<Lock />}
        title={`${refusal.firstName} está bloqueado`}
        titleRef={attempt.heading}
        escapeKeycap
      >
        <SignInLockout consecutiveFailures={refusal.consecutiveFailures} />
      </BrandPanelCard>
    );
  }

  const [firstOption, ...otherOptions] = people.map((person) => ({
    value: person.id,
    label: person.first_name,
  }));

  const usersState = (
    <>
      {users.status === "loading" ? <LoadingPlaceholder variant="list" items={3} /> : null}
      {users.status === "failed" ? (
        <LoadFailure
          variant="keyboard"
          keycap="R"
          icon={<CircleX />}
          title="No se pudieron cargar los usuarios"
          description="Volvé a intentarlo en unos segundos."
          onRetry={users.retry}
        />
      ) : null}
      {users.status === "loaded" && firstOption === undefined ? <NobodyListed /> : <SignInLinks />}
    </>
  );

  if (firstOption === undefined) {
    return (
      <BrandPanelCard icon={<UsersRound />} title="¿Quién abre la caja?">
        {usersState}
      </BrandPanelCard>
    );
  }

  return (
    <BrandPanelCard>
      <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
        <UserSelect
          label="USUARIO"
          options={[firstOption, ...otherOptions]}
          value={chosen?.id ?? null}
          onChange={choose}
          disabled={submitting}
        />
        <PinAttemptControls attempt={attempt} pinInput={attempt.pinInput} />
      </form>
      {usersState}
    </BrandPanelCard>
  );
}

export function SignInScreen({
  version,
  ...props
}: SignInScreenProps & { version: string | null }) {
  return (
    <BrandPanelScreen version={version}>
      <SignInPanel {...props} />
    </BrandPanelScreen>
  );
}
