import { PersistentNotification } from "@purosur/ui";
import { Info } from "lucide-react";
import { useReleaseOutdated } from "../platform/release-monitor";

export function NewReleaseNotice({ reloadPage }: { reloadPage: () => void }) {
  if (!useReleaseOutdated()) {
    return null;
  }
  return (
    <PersistentNotification
      tone="info"
      icon={<Info />}
      title="Hay una versión nueva del backoffice"
      action={{ label: "Recargar", onPress: reloadPage }}
    />
  );
}
