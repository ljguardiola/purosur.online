import type { ReactNode } from "react";
import { Focusable } from "react-aria-components";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import { Tag, type TagProps } from "./Tag";
import { Tooltip } from "./Tooltip";

test("renders its text content", async () => {
  const screen = await render(<Tag tone="neutral">Caja</Tag>);

  await expect.element(screen.getByText("Caja")).toBeInTheDocument();
  await expectNoAccessibilityViolations(screen.container);
});

test("colors the neutral tone bone with secondary ink text, clearing AA text contrast", async () => {
  const screen = await render(<Tag tone="neutral">Caja</Tag>);
  const tag = screen.getByText("Caja").element() as HTMLElement;
  const style = getComputedStyle(tag);

  expect(style.backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(style.color).toBe(tokenRgb("ink-secondary"));
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("colors the info tone blue message background with strong blue text, clearing AA text contrast", async () => {
  const screen = await render(<Tag tone="info">PIN</Tag>);
  const tag = screen.getByText("PIN").element() as HTMLElement;
  const style = getComputedStyle(tag);

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(style.color).toBe(tokenRgb("brand-blue-strong"));
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("renders the caller's icon hidden from assistive technology", async () => {
  const screen = await render(
    <Tag tone="info" icon={<svg data-testid="pin-icon" />}>
      PIN
    </Tag>,
  );

  const icon = screen.container.querySelector("[data-testid='pin-icon']") as SVGElement;
  expect(icon).not.toBeNull();
  expect(icon.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("renders no icon wrapper when none is given", async () => {
  const screen = await render(<Tag tone="neutral">Caja</Tag>);
  const tag = screen.getByText("Caja").element() as HTMLElement;

  expect(tag.querySelector("svg")).toBeNull();
});

test("wrapped in Focusable with an img role and label, becomes a working Tooltip trigger reachable by keyboard, warning of none", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const screen = await render(
    <main>
      <Tooltip description="Se usa en la caja.">
        <Focusable>
          <Tag tone="neutral" role="img" aria-label="Caja">
            Caja
          </Tag>
        </Focusable>
      </Tooltip>
    </main>,
  );

  await userEvent.tab();

  expect(document.activeElement).toBe(screen.getByRole("img", { name: "Caja" }).element());
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Se usa en la caja.");
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("interactive ARIA role"));
  warn.mockRestore();

  await expectNoAccessibilityViolations(document.body, {
    checks: {
      region: {
        options: {
          regionMatcher: "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip]",
        },
      },
    },
  });
});

test("does not accept a tag without content", () => {
  expectTypeOf<{ tone: "neutral" }>().not.toExtend<TagProps>();
});

test("does not accept a tag without a tone", () => {
  expectTypeOf<{ children: ReactNode }>().not.toExtend<TagProps>();
});
