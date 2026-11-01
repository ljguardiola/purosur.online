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

async function downloadSpreadsheet(workbook: Workbook, fileName: string): Promise<void> {
  const { writeWorkbook } = await import("../platform/spreadsheet/spreadsheet-writer");
  const file = writeWorkbook(workbook);
  downloadFile(new Blob([file.slice()], { type: SPREADSHEET_MIME_TYPE }), fileName);
}

export function ReportDownload({ dataStatus, workbook, fileName }: ReportDownloadProps) {
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);

  function download() {
    const built = workbook();
    if (built === null) {
      return;
    }
    setFailed(false);
    setPreparing(true);
    downloadSpreadsheet(built, fileName).then(
      () => setPreparing(false),
      () => {
        setFailed(true);
        setPreparing(false);
      },
    );
  }

  return (
    <>
      <SpreadsheetDownloadButton dataStatus={dataStatus} preparing={preparing} onPress={download} />
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

export type RegisterReportDownloadProps = Omit<ReportDownloadProps, "workbook"> & {
  registerLabel: string | undefined;
  workbook: (registerLabel: string) => Workbook | null;
};

export function RegisterReportDownload({
  registerLabel,
  dataStatus,
  workbook,
  fileName,
}: RegisterReportDownloadProps) {
  return (
    <ReportDownload
      dataStatus={registerLabel === undefined ? "loading" : dataStatus}
      workbook={() => (registerLabel === undefined ? null : workbook(registerLabel))}
      fileName={fileName}
    />
  );
}
