import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { ScanProblem } from "./scan-problem-message";
import { ScanProblemMessage } from "./scan-problem-message";

describe("ScanProblemMessage", () => {
  it.each<{ problem: ScanProblem; title: string; help: string }>([
    {
      problem: { kind: "scan_failed" },
      title: "No se pudo agregar el producto",
      help: "Probá escanearlo de nuevo.",
    },
    {
      problem: { kind: "add_failed" },
      title: "No se pudo agregar el producto",
      help: "Probá elegirlo de nuevo.",
    },
    {
      problem: { kind: "search_failed" },
      title: "No se pudo buscar el producto",
      help: "Probá escribirlo de nuevo.",
    },
  ])(
    "tells what failed and how to try again when $problem.kind",
    async ({ problem, title, help }) => {
      const screen = await render(<ScanProblemMessage problem={problem} />);

      const region = screen.getByRole("status");
      await expect.element(region.getByText(title, { exact: true })).toBeVisible();
      await expect.element(region.getByText(help, { exact: true })).toBeVisible();
    },
  );
});
