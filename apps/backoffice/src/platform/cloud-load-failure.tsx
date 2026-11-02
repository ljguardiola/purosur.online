import type { LoadFailureProps } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { OUTDATED_TAB_ADVICE } from "./action-failure-notice";
import { retryAfterDetail } from "./retry-after-detail";
import type { CloudData } from "./use-cloud-query";

export function cloudLoadFailure(
  data: Extract<CloudData<unknown>, { status: "failed" }>,
  subject: string,
): LoadFailureProps {
  if (data.retryAfterSeconds !== undefined) {
    return {
      icon: <ShieldX />,
      title: "Demasiadas solicitudes",
      description: retryAfterDetail(data.retryAfterSeconds),
      onRetry: data.retry,
    };
  }
  return {
    icon: <TriangleAlert />,
    title: `No pudimos abrir ${subject}`,
    description: data.outdated ? OUTDATED_TAB_ADVICE : "Probá de nuevo en unos minutos.",
    onRetry: data.retry,
  };
}
