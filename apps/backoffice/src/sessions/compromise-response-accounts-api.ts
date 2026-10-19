import { branchUserListSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type Account = { id: string; firstName: string; email: string };

export async function fetchAccounts(): Promise<CloudReadOutcome<Account[]>> {
  let response: Response;
  try {
    response = await fetch("/api/users");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = branchUserListSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return {
    kind: "ok",
    value: parsed.data.map((user) => ({
      id: user.id,
      firstName: user.first_name,
      email: user.email,
    })),
  };
}
