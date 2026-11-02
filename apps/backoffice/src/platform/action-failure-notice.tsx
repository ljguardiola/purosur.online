import { InlineNotice } from "@purosur/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useReleaseOutdated } from "./release-monitor";

export const RETRY_ADVICE = "Probá de nuevo.";
export const RETRY_ADVICE_IN_A_FEW_MINUTES = "Probá de nuevo en unos minutos.";
export const RETRY_ADVICE_LATER = "Probá de nuevo más tarde.";
export const CHECK_CONNECTION_THEN_RETRY_ADVICE = "Revisá la conexión a internet y probá de nuevo.";

const OUTDATED_ADVICE = "Recargá la página para seguir.";

type ActionFailureNoticeProps = {
  title: string;
  description?: string;
};

export function ActionFailureNotice({
  title,
  description = RETRY_ADVICE,
}: ActionFailureNoticeProps) {
  if (useReleaseOutdated()) {
    return (
      <InlineNotice
        tone="error"
        icon={<RefreshCw />}
        title="Se actualizó el backoffice"
        description="Recargá la página para seguir: este cambio no se guardó."
      />
    );
  }
  return (
    <InlineNotice tone="error" icon={<TriangleAlert />} title={title} description={description} />
  );
}

export function useFailureText(text: string): string {
  return useReleaseOutdated() ? "Se actualizó el backoffice. Recargá la página para seguir." : text;
}

export function useRetryAdvice(): string {
  return useReleaseOutdated() ? OUTDATED_ADVICE : RETRY_ADVICE;
}
