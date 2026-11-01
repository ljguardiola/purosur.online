import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { ReportDownload } from "./report-download";
import { render } from "./test-support/render-with-router";
import { spyOnDownloads } from "./test-support/spy-on-downloads";

const writerLoad = vi.hoisted(() => {
  let resolve = () => {};
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve: () => resolve() };
});

vi.mock("../platform/spreadsheet/spreadsheet-writer", async (importOriginal) => {
  await writerLoad.promise;
  return importOriginal();
});

const workbook: Workbook = {
  sheets: [
    { name: "Ventas", header: ["Día", "Total"], rows: [[cell.day("2026-10-02"), cell.money(500)]] },
  ],
};

test("stays disabled while the file is being prepared, so a second press downloads nothing", async () => {
  const downloads = spyOnDownloads();
  const build = vi.fn(() => workbook);
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportDownload
          dataStatus="loaded"
          workbook={build}
          fileName="ventas-2026-10-01-2026-10-07.xlsx"
        />
      </main>
    </FieldSizeProvider>,
  );
  const button = screen.getByRole("button", { name: "Descargar planilla" });

  await userEvent.click(button);
  await expect.element(button).toBeDisabled();
  await userEvent.click(button, { force: true });
  writerLoad.resolve();

  await expect.element(button).toBeEnabled();
  expect(build).toHaveBeenCalledTimes(1);
  expect(downloads.names).toEqual(["ventas-2026-10-01-2026-10-07.xlsx"]);
});
