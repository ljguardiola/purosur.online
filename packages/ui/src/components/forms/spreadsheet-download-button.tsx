import { Download } from "lucide-react";
import type { LoadStatus } from "../shared/load-status";
import { Button, type ButtonProps } from "./button";

export type SpreadsheetDownloadButtonProps = Pick<ButtonProps, "onPress" | "disabledReason"> & {
  dataStatus?: LoadStatus;
  preparing?: boolean;
};

export function SpreadsheetDownloadButton({
  onPress,
  disabledReason,
  dataStatus,
  preparing = false,
}: SpreadsheetDownloadButtonProps) {
  return (
    <Button
      variant="secondary"
      icon={<Download aria-hidden="true" />}
      onPress={onPress}
      disabled={preparing}
      {...(disabledReason === undefined ? {} : { disabledReason })}
      {...(dataStatus === undefined ? {} : { dataStatus })}
    >
      Descargar planilla
    </Button>
  );
}
