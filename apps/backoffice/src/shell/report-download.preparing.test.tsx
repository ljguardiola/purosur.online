import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderDownload, workbook } from "./test-support/report-download";
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

test("stays disabled while the file is being prepared, so a second press downloads nothing", async () => {
  const downloads = spyOnDownloads();
  const build = vi.fn(() => workbook);
  const screen = await renderDownload({ workbook: build });
  const button = screen.getByRole("button", { name: "Descargar planilla" });

  await userEvent.click(button);
  await expect.element(button).toBeDisabled();
  await userEvent.click(button, { force: true });
  writerLoad.resolve();

  await expect.element(button).toBeEnabled();
  expect(build).toHaveBeenCalledTimes(1);
  expect(downloads.names).toEqual(["ventas-2026-10-01-2026-10-07.xlsx"]);
});
