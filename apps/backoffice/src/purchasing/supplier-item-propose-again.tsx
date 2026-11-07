import { Button, InlineNotice, type LoadStatus } from "@purosur/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";

export function ProposeAgainButton({
  dataStatus,
  refreshing,
  onPress,
}: {
  dataStatus: LoadStatus;
  refreshing: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="text"
      icon={<RefreshCw />}
      dataStatus={dataStatus}
      disabled={refreshing}
      onPress={onPress}
    >
      Volver a proponer
    </Button>
  );
}

export function ProposeAgainFailure() {
  return (
    <InlineNotice tone="error" icon={<TriangleAlert />} title="No pudimos volver a proponer" />
  );
}
