import { afterEach, expect, test, vi } from "vitest";
import { downloadFile } from "./download-file";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("clicks a temporary link to the blob named with the file name, then removes it", () => {
  const blob = new Blob(["contents"]);
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const clicked: { href: string; download: string; attached: boolean }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({
      href: this.href,
      download: this.download,
      attached: document.body.contains(this),
    });
  });

  downloadFile(blob, "ventas.xlsx");

  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(clicked).toEqual([{ href: "blob:mock-url", download: "ventas.xlsx", attached: true }]);
  expect(document.body.querySelector("a[download]")).toBeNull();
});

test("keeps the blob's address alive for a minute after the click and revokes it then", () => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  downloadFile(new Blob(["contents"]), "ventas.xlsx");

  vi.advanceTimersByTime(59_999);
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
});
