import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { StepNotice } from "./use-step-attempt";

export type StepAttemptNotice = StepNotice<"outdated" | "notFound" | "ownAccount">;

export function StepAttemptNotices({
  notice,
  failedTitle,
}: {
  notice: StepAttemptNotice | null;
  failedTitle: string;
}) {
  switch (notice?.kind) {
    case "attemptFailed":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={failedTitle}
          description="Probá de nuevo."
        />
      );
    case "rateLimited":
      return (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      );
    case "outdated":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="El instructivo cambió"
          description="Se actualizó con lo último. Revisá en qué paso estás."
        />
      );
    case "notFound":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Esa cuenta ya no existe"
          description="Elegí otra."
        />
      );
    case "ownAccount":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No podés elegir tu propia cuenta"
          description="Elegí la cuenta que sospechás comprometida."
        />
      );
    case undefined:
      return null;
  }
}
