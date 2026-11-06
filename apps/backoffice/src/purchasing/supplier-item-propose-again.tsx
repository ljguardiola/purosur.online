import { Button, InlineNotice } from "@purosur/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";

export function ProposeAgainButton({
  refreshing,
  onPress,
}: {
  refreshing: boolean;
  onPress: () => void;
}) {
  return (
    <Button variant="text" icon={<RefreshCw />} disabled={refreshing} onPress={onPress}>
      Volver a proponer
    </Button>
  );
}

export function ProposeAgainFailure() {
  return (
    <InlineNotice
      tone="error"
      icon={<TriangleAlert />}
      title="No pudimos volver a proponer"
      description="La propuesta anterior sigue igual. Probá de nuevo en un momento."
    />
  );
}
