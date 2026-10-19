import type { CompromiseResponseSessionsAndPasskeysBody } from "@purosur/contracts";
import type { Option, Options } from "@purosur/ui";
import type { BranchUser } from "../platform/branch-users-api";

export type EndSessionsFormValues = { accountId: string };

export const EMPTY_VALUES: EndSessionsFormValues = { accountId: "" };

export const REQUEST_FIELDS = { account_id: "accountId" } as const;

export const MESSAGES = { accountId: "Elegí una cuenta." } as const;

export function requestFrom({
  accountId,
}: EndSessionsFormValues): CompromiseResponseSessionsAndPasskeysBody {
  return { account_id: accountId };
}

export function accountOptions(accounts: BranchUser[]): Options<Option<string>> | undefined {
  const [first, ...rest] = accounts
    .filter((account) => account.mayRemovePasskey)
    .map((account) => ({
      value: account.id,
      label: `${account.firstName} · ${account.email}`,
    }));
  return first && [first, ...rest];
}
