import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { RegisterReportDownload, ReportDownload } from "./report-download";
import { render } from "./test-support/render-with-router";
import { spyOnDownloads } from "./test-support/spy-on-downloads";

const workbook: Workbook = {
  sheets: [
    { name: "Ventas", header: ["Día", "Total"], rows: [[cell.day("2026-10-02"), cell.money(500)]] },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDownload(props: Partial<Parameters<typeof ReportDownload>[0]> = {}) {
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

test("downloads the workbook as an xlsx file under the given name when pressed", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderDownload();

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names).toEqual(["ventas-2026-10-01-2026-10-07.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Ventas"]);
  expect(file.sheet(0).get("B2")?.value).toBe("5");
  expect(downloads.blobs[0]?.type).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("builds the workbook only when pressed", async () => {
  spyOnDownloads();
  const build = vi.fn(() => workbook);
  const screen = await renderDownload({ workbook: build });

  expect(build).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => build.mock.calls.length).toBe(1);
});

test("is disabled while the data loads and after loading fails", async () => {
  for (const dataStatus of ["loading", "failed"] as const) {
    const screen = await renderDownload({ dataStatus });

    await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
    await screen.unmount();
  }
});

test("stays disabled while the file is being prepared, so a second press downloads nothing", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderDownload();
  const button = screen.getByRole("button", { name: "Descargar planilla" });

  await userEvent.click(button);
  await userEvent.click(button, { force: true });

  await expect.poll(() => downloads.names.length).toBe(1);
  await expect.element(button).toBeEnabled();
});

test("tells the person the file could not be prepared when it cannot be built, and offers the download again", async () => {
  spyOnDownloads();
  const invalid: Workbook = { sheets: [{ name: "a/b", header: ["x"], rows: [] }] };
  const screen = await renderDownload({ workbook: () => invalid });

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.element(screen.getByText("No se pudo preparar la planilla")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeEnabled();
});

test("does nothing when there is no workbook to build", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderDownload({ workbook: () => null });

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  expect(downloads.names).toEqual([]);
  expect(screen.getByText("No se pudo preparar la planilla").query()).toBeNull();
});

function renderRegisterDownload(
  registerLabel: string | undefined,
  build: (registerLabel: string) => Workbook | null,
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <RegisterReportDownload
          dataStatus="loaded"
          registerLabel={registerLabel}
          workbook={build}
          fileName="ventas-2026-10-01-2026-10-07.xlsx"
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("waits for the name of the register before the download of a report filtered by register", async () => {
  const screen = await renderRegisterDownload(undefined, () => workbook);

  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeDisabled();
});

test("builds the workbook of a report filtered by register with the register's name", async () => {
  const downloads = spyOnDownloads();
  const build = vi.fn(() => workbook);
  const screen = await renderRegisterDownload("Caja del fondo", build);

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names.length).toBe(1);
  expect(build).toHaveBeenCalledWith("Caja del fondo");
});
