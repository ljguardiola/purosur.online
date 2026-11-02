import { InlineNotice } from "@purosur/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useReleaseOutdated } from "./release-monitor";

const OUTDATED_ADVICE = "Recargá la página para seguir.";

type ActionFailureNoticeProps = {
  title: string;
  description?: string;
};

export function ActionFailureNotice({
  title,
  description = "Probá de nuevo.",
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
  return useReleaseOutdated() ? OUTDATED_ADVICE : "Probá de nuevo.";
}
