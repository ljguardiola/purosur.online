import { InlineNotice } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import { useReleaseOutdated } from "./release-monitor";

export const OUTDATED_TAB_ADVICE = "Se actualizó el backoffice: recargá la página para seguir.";

type ActionFailureNoticeProps = {
  title: string;
  description?: string;
};

export function ActionFailureNotice({
  title,
  description = "Probá de nuevo.",
}: ActionFailureNoticeProps) {
  const shownDescription = useFailureText(description);
  return (
    <InlineNotice
      tone="error"
      icon={<TriangleAlert />}
      title={title}
      description={shownDescription}
    />
  );
}

export function useFailureText(text: string): string {
  return useReleaseOutdated() ? OUTDATED_TAB_ADVICE : text;
}

export function useRetryAdvice(): string {
  return useFailureText("Probá de nuevo.");
}
