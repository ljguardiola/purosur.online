import { vi } from "vitest";
// A report downloads only after importing the spreadsheet writer on demand; loading it with the test
// file keeps that import from waiting on a loaded test server once the download is under way.
import "../../platform/spreadsheet/spreadsheet-writer";

export function spyOnDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return "blob:mock-url";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return { blobs, names };
}
