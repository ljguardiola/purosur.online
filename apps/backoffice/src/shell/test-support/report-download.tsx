import { FieldSizeProvider } from "@purosur/ui";
import { cell, type Workbook } from "../../platform/spreadsheet/workbook";
import { ReportDownload } from "../report-download";
import { render } from "./render-with-router";

export const workbook: Workbook = {
  sheets: [
    { name: "Ventas", header: ["Día", "Total"], rows: [[cell.day("2026-10-02"), cell.money(500)]] },
  ],
};

export function renderDownload(props: Partial<Parameters<typeof ReportDownload>[0]> = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportDownload
          dataStatus="loaded"
          workbook={() => workbook}
          fileName="ventas-2026-10-01-2026-10-07.xlsx"
          {...props}
        />
      </main>
    </FieldSizeProvider>,
  );
}
