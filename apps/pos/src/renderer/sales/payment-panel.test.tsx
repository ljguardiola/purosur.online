import { describe, it } from "vitest";
import { render } from "vitest-browser-react";
import { expectDrawnAsFigureStat } from "../platform/test-support/figure-stat";
import { PaymentPanel } from "./payment-panel";

describe("PaymentPanel", () => {
  it("draws the total as the design system's figure stat", async () => {
    const screen = await render(
      <PaymentPanel
        lineCount={2}
        total={476_000}
        paid={0}
        pending={476_000}
        cancellable
        chargeRefusal={null}
        canCancel
        onCharge={() => {}}
        onCancel={() => {}}
      />,
    );

    await expectDrawnAsFigureStat(
      screen.getByText("Total a cobrar").element(),
      screen.getByText("$ 4.760,00").first().element(),
    );
  });
});
