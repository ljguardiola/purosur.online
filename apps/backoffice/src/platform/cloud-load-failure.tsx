import type { LoadFailureProps } from "@purosur/ui";
import { RefreshCw, ShieldX, TriangleAlert } from "lucide-react";
import { RETRY_ADVICE_IN_A_FEW_MINUTES } from "./action-failure-notice";
import { retryAfterDetail } from "./retry-after-detail";
import type { CloudData } from "./use-cloud-query";

function reloadCurrentPage() {
  window.location.reload();
}

export function cloudLoadFailure(
  data: Extract<CloudData<unknown>, { status: "failed" }>,
  subject: string,
  reloadPage: () => void = reloadCurrentPage,
): LoadFailureProps {
  if (data.retryAfterSeconds !== undefined) {
    return {
      icon: <ShieldX />,
      title: "Demasiadas solicitudes",
      description: retryAfterDetail(data.retryAfterSeconds),
      onRetry: data.retry,
    };
  }
  if (data.outdated) {
    return {
      icon: <RefreshCw />,
      title: "Se actualizó el backoffice",
      description: "Recargá la página para seguir.",
      onRetry: reloadPage,
    };
  }
  return {
    icon: <TriangleAlert />,
    title: `No pudimos abrir ${subject}`,
    description: RETRY_ADVICE_IN_A_FEW_MINUTES,
    onRetry: data.retry,
  };
}
