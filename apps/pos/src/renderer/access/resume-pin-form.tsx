import type { SignInUser } from "@purosur/contracts";
import { PinAttemptControls } from "./pin-attempt-controls";
import type { PinAttempt } from "./use-pin-attempt";
import { UserPicker } from "./user-picker";

export function ResumePinForm({
  opener,
  attempt,
  labelledBy,
}: {
  opener: SignInUser;
  attempt: PinAttempt;
  labelledBy: string;
}) {
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
      <UserPicker
        users={[opener]}
        value={opener.id}
        onChange={() => {}}
        labelledBy={labelledBy}
        disabled={attempt.submitting}
      />
      <PinAttemptControls attempt={attempt} pinInput={attempt.pinInput} submitLabel="Retomar" />
    </form>
  );
}
