import { Bell } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { expectFullyRound } from "../../test/fully-round";
import { tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import { Pill, type PillProps } from "./pill";

test("shows its text beside its icon, which assistive technology does not read", async () => {
  const screen = await render(
    <main>
      <Pill tone="warning" icon={<Bell />}>
        3 alertas abiertas
      </Pill>
    </main>,
  );

  const pill = screen.getByText("3 alertas abiertas").element() as HTMLElement;
  expect(pill.textContent).toBe("3 alertas abiertas");
  expect(pill.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(document.body);
});

test("draws a fully round 28px pill in semibold detail text with a 14px icon", async () => {
  const screen = await render(
    <Pill tone="warning" icon={<Bell />}>
      3 alertas abiertas
    </Pill>,
  );

  const pill = screen.getByText("3 alertas abiertas").element() as HTMLElement;
  const style = getComputedStyle(pill);
  expect(style.display).toBe("inline-flex");
  expect(pill.getBoundingClientRect().height).toBe(28);
  expect(style.paddingLeft).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.columnGap).toBe("8px");
  expect(style.fontWeight).toBe("600");
  expectFullyRound(pill);
  expect((pill.querySelector("svg") as SVGSVGElement).getBoundingClientRect().width).toBe(14);
});

test("paints each tone's subtle fill under its strong text", async () => {
  for (const tone of ["warning", "error"] as const) {
    const screen = await render(
      <Pill tone={tone} icon={<Bell />}>
        {`Tono ${tone}`}
      </Pill>,
    );

    const style = getComputedStyle(screen.getByText(`Tono ${tone}`).element());
    expect(style.backgroundColor, tone).toBe(tokenRgb(`${tone}-subtle`));
    expect(style.color, tone).toBe(tokenRgb(`${tone}-strong`));
  }
});

test("accepts only the warning and error tones, and needs its text and icon", () => {
  expectTypeOf<{ tone: "warning"; icon: Icon; children: string }>().toExtend<PillProps>();
  expectTypeOf<{ tone: "info"; icon: Icon; children: string }>().not.toExtend<PillProps>();
  expectTypeOf<{ tone: "warning"; children: string }>().not.toExtend<PillProps>();
  expectTypeOf<{ tone: "warning"; icon: Icon }>().not.toExtend<PillProps>();
  expectTypeOf<PillProps>().not.toHaveProperty("className");
});
