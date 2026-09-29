import type { LoadFailureProps, TableLoadingState } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "./retry-after-detail";
import type { CloudData } from "./use-cloud-query";

export type CloudTableState = { loading: TableLoadingState } | { failure: LoadFailureProps };

export function cloudTableState(data: CloudData<unknown>, subject: string): CloudTableState {
  if (data.status === "failed") {
    return {
      failure:
        data.retryAfterSeconds === undefined
          ? {
              icon: <TriangleAlert />,
              title: `No pudimos abrir ${subject}`,
              description: "Probá de nuevo en unos minutos.",
              onRetry: data.retry,
            }
          : {
              icon: <ShieldX />,
              title: "Demasiadas solicitudes",
              description: retryAfterDetail(data.retryAfterSeconds),
              onRetry: data.retry,
            },
    };
  }
  if (data.status === "loading") {
    return { loading: "initial" };
  }
  return { loading: data.refreshing ? "updating" : false };
}
