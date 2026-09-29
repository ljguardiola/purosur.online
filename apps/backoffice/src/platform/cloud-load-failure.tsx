import type { LoadFailureProps } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "./retry-after-detail";
import type { CloudData } from "./use-cloud-query";

export function cloudLoadFailure(
  data: Extract<CloudData<unknown>, { status: "failed" }>,
  subject: string,
): LoadFailureProps {
  return data.retryAfterSeconds === undefined
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
      };
}
