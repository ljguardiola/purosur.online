import { Button, InlineNotice } from "@purosur/ui";
import { ShieldOff, ShieldX, TriangleAlert } from "lucide-react";
import { messages } from "./messages";

const rolesMessages = messages.settings.roles;
const loadMessages = rolesMessages.roleLoad;

/** Every state a page that loads a role before showing its form can be in, short of loaded. */
export type RoleLoadStatus =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "forbidden" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

/** The status a role read's failure leaves the page in; an ended session is the caller's to handle. */
export function failedRoleLoadStatus(
  outcome:
    | { kind: "not_found" }
    | { kind: "forbidden" }
    | { kind: "rate_limited"; retryAfterSeconds: number }
    | { kind: "failed" },
): RoleLoadStatus {
  if (outcome.kind === "not_found") {
    return { kind: "notFound" };
  }
  if (outcome.kind === "rate_limited") {
    return { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds };
  }
  if (outcome.kind === "forbidden") {
    return { kind: "forbidden" };
  }
  return { kind: "loadError" };
}

/** The whole page a non-Administrator sees instead of a role page. */
export function RolesForbiddenNotice() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title={rolesMessages.forbiddenTitle}
        detail={rolesMessages.forbiddenDetail}
      />
    </div>
  );
}

/**
 * The loading, not-found, load-error and rate-limited states, the last two offering to load again;
 * nothing once loaded (the page renders its form then) or forbidden (the page renders
 * `RolesForbiddenNotice` instead).
 */
export function RoleLoadStatusView({
  state,
  onRetry,
}: {
  state: RoleLoadStatus | { kind: "loaded" };
  onRetry: () => void;
}) {
  if (state.kind === "loading") {
    return <p role="status">{loadMessages.loading}</p>;
  }
  if (state.kind === "notFound") {
    return <InlineNotice tone="error" icon={<ShieldOff />} title={loadMessages.notFoundTitle} />;
  }
  if (state.kind === "loadError") {
    return (
      <>
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={loadMessages.loadErrorTitle}
          detail={loadMessages.loadErrorDetail}
        />
        <Button variant="secondary" onPress={onRetry}>
          {rolesMessages.retry}
        </Button>
      </>
    );
  }
  if (state.kind === "rate_limited") {
    return (
      <>
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={rolesMessages.rateLimitedTitle}
          detail={rolesMessages.rateLimitedDetail({
            minutes: Math.ceil(state.retryAfterSeconds / 60),
          })}
        />
        <Button variant="secondary" onPress={onRetry}>
          {rolesMessages.retry}
        </Button>
      </>
    );
  }
  return null;
}
