import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CashCountStrip } from "./cash-count-strip";

function cellOf(screen: Awaited<ReturnType<typeof render>>, label: string) {
  return screen.getByText(label, { exact: true }).element().closest("div")?.textContent;
}

describe("CashCountStrip", () => {
  it("compares what is expected with what was counted", async () => {
    const screen = await render(<CashCountStrip expected={4_620_000} counted={4_580_000} />);

    expect(cellOf(screen, "Esperado")).toBe("Esperado$ 46.200,00");
    expect(cellOf(screen, "Contado")).toBe("Contado$ 45.800,00");
    expect(cellOf(screen, "Diferencia")).toBe("Diferencia− $ 400,00");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows no count and no difference before anything valid was counted", async () => {
    const screen = await render(<CashCountStrip expected={4_620_000} counted={undefined} />);

    expect(cellOf(screen, "Contado")).toBe("Contado—");
    expect(cellOf(screen, "Diferencia")).toBe("Diferencia—");
  });

  it("shows no expected cash and no difference while the expected cash is unknown", async () => {
    const screen = await render(<CashCountStrip expected={undefined} counted={4_580_000} />);

    expect(cellOf(screen, "Esperado")).toBe("Esperado—");
    expect(cellOf(screen, "Contado")).toBe("Contado$ 45.800,00");
    expect(cellOf(screen, "Diferencia")).toBe("Diferencia—");
  });
});
