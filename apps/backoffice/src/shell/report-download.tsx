import { FloatingNotification, type LoadStatus, SpreadsheetDownloadButton } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { downloadFile } from "../platform/download-file";
import type { Workbook } from "../platform/spreadsheet/workbook";

const SPREADSHEET_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ReportDownloadProps = {
  dataStatus: LoadStatus;
  workbook: () => Workbook | null;
  fileName: string;
};

export function ReportDownload({ dataStatus, workbook, fileName }: ReportDownloadProps) {
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    const built = workbook();
    if (built === null) {
      return;
    }
    setFailed(false);
    setPreparing(true);
    try {
      const { writeWorkbook } = await import("../platform/spreadsheet/spreadsheet-writer");
      const file = writeWorkbook(built);
      downloadFile(new Blob([file.slice()], { type: SPREADSHEET_MIME_TYPE }), fileName);
    } catch {
      setFailed(true);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <>
      <SpreadsheetDownloadButton
        dataStatus={dataStatus}
        preparing={preparing}
        onPress={() => void download()}
      />
      {failed ? (
        <FloatingNotification
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo preparar la planilla"
          description="Probá de nuevo."
          onDismiss={() => setFailed(false)}
        />
      ) : null}
    </>
  );
}
