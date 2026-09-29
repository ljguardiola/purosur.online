import type { LoadFailureProps, TableLoadingState } from "@purosur/ui";
import { cloudLoadFailure } from "./cloud-load-failure";
import type { CloudData } from "./use-cloud-query";

export type CloudTableState = { loading: TableLoadingState } | { failure: LoadFailureProps };

export function cloudTableState(data: CloudData<unknown>, subject: string): CloudTableState {
  if (data.status === "failed") {
    return { failure: cloudLoadFailure(data, subject) };
  }
  if (data.status === "loading") {
    return { loading: "initial" };
  }
  return { loading: data.refreshing ? "updating" : false };
}
