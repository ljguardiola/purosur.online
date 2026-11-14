import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { sortedItems, textOrder, UserSelect } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Check, KeyRound, Lock, UserLock } from "lucide-react";
import { useState } from "react";
import type { SignInUsers } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import { PinAttemptControls } from "../platform/pin-attempt-controls";
import { SignInLockout } from "../platform/sign-in-lockout";
import { useSignInUsersQuery } from "../platform/sign-in-users-query";
import { usePinAttempt } from "../platform/use-pin-attempt";
import { BrandPanelCard } from "../shell/brand-panel-card";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import type { SignedInPerson } from "../shell/signed-in-person";

export type LockedRegisterScreenProps = {
  opener: SignedInPerson;
  registerName: string | null;
  version: string | null;
  loadUsers: () => Promise<SignInUsers>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

function CloseWithAnotherLink() {
  return (
    <ScreenLink
      to="/locked-close"
      icon={<UserLock />}
      label="Cerrar con otro usuario"
      keycap="F12"
    />
  );
}

function peopleOf(users: readonly SignInUser[], opener: SignedInPerson): SignInUser[] {
  const listed = users.some((user) => user.id === opener.user_id)
    ? users
    : [...users, { id: opener.user_id, first_name: opener.first_name }];
  return sortedItems(listed, {
    order: textOrder((user: SignInUser) => user.first_name),
    direction: "ascending",
  });
}

function LockedPanel({
  opener,
  registerName,
  loadUsers,
  signIn,
}: Omit<LockedRegisterScreenProps, "version">) {
  const navigate = useNavigate();
  const users = useSignInUsersQuery(loadUsers);
  const [chosenId, setChosenId] = useState(opener.user_id);
  const people = peopleOf(users.status === "loaded" ? users.value.users : [], opener);
  const chosen = people.find((person) => person.id === chosenId) ?? people[0];
  const attempt = usePinAttempt(
    chosen === undefined
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
      enabled: !submitting && !locked,
    },
    { key: "F12", run: () => void navigate({ to: "/locked-close" }) },
    { key: "F3", run: () => void navigate({ to: "/pin-code-redemption" }) },
  ]);

  if (refusal?.kind === "locked") {
    return (
      <BrandPanelCard
        icon={<Lock />}
        title={`${refusal.firstName} está bloqueado`}
        titleRef={attempt.heading}
      >
        <SignInLockout consecutiveFailures={refusal.consecutiveFailures} />
        <CloseWithAnotherLink />
      </BrandPanelCard>
    );
  }

  return (
    <BrandPanelCard
      icon={<Lock />}
      title={registerName === null ? opener.first_name : `${registerName} · ${opener.first_name}`}
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
        <UserSelect
          label="USUARIO"
          options={people.map((person) => ({ value: person.id, label: person.first_name }))}
          value={chosen?.id ?? null}
          onChange={choose}
          disabled={submitting}
        />
        <PinAttemptControls
          attempt={attempt}
          pinInput={attempt.pinInput}
          submitLabel="Desbloquear"
          submitIcon={<Check />}
        />
      </form>
      <div className="flex flex-col gap-1">
        <CloseWithAnotherLink />
        <ScreenLink
          to="/pin-code-redemption"
          icon={<KeyRound />}
          label="Cambiar PIN con código"
          keycap="F3"
        />
      </div>
    </BrandPanelCard>
  );
}

export function LockedRegisterScreen({ version, ...props }: LockedRegisterScreenProps) {
  return (
    <BrandPanelScreen version={version}>
      <LockedPanel {...props} />
    </BrandPanelScreen>
  );
}
