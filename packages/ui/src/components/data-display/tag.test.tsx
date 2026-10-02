import type { ReactElement, ReactNode } from "react";
import { Focusable } from "react-aria-components";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import { Tooltip } from "../overlays/tooltip";
import { Tag, type TagProps } from "./tag";

test("renders its text content", async () => {
  const screen = await render(<Tag tone="neutral">Caja</Tag>);

  await expect.element(screen.getByText("Caja")).toBeInTheDocument();
});

test("forwards a ref to the underlying span element", async () => {
  let element: HTMLSpanElement | null = null;

  await render(
    <Tag
      tone="neutral"
      ref={(node) => {
        element = node;
      }}
    >
      Caja
    </Tag>,
  );

  expect(element).toBeInstanceOf(HTMLSpanElement);
});

test("colors the neutral tone bone with secondary ink text, clearing AA text contrast", async () => {
  const screen = await render(<Tag tone="neutral">Caja</Tag>);
  const tag = screen.getByText("Caja").element() as HTMLElement;
  const style = getComputedStyle(tag);

  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.color).toBe(tokenRgb("text-subtle"));
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("colors the info tone blue message background with strong blue text, clearing AA text contrast", async () => {
  const screen = await render(<Tag tone="info">PIN</Tag>);
  const tag = screen.getByText("PIN").element() as HTMLElement;
  const style = getComputedStyle(tag);

  expect(style.backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(style.color).toBe(tokenRgb("text-accent"));
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("colors the success tone green message background with strong green text, clearing AA text contrast", async () => {
  const screen = await render(<Tag tone="success">10 % de descuento</Tag>);
  const tag = screen.getByText("10 % de descuento").element() as HTMLElement;
  const style = getComputedStyle(tag);

  expect(style.backgroundColor).toBe(tokenRgb("success-subtle"));
  expect(style.color).toBe(tokenRgb("success-strong"));
  expect(
    contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor)),
  ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test.each<TagProps["tone"]>(["neutral", "info", "success"])(
  "the %s tone draws the focus ring when reached by keyboard",
  async (tone) => {
    const screen = await render(
      <Focusable>
        <Tag tone={tone} role="img" aria-label="Etiqueta">
          Etiqueta
        </Tag>
      </Focusable>,
    );
    const tag = screen.getByRole("img", { name: "Etiqueta" }).element() as HTMLElement;

    await userEvent.tab();

    expect(document.activeElement).toBe(tag);
    await expect.poll(() => getComputedStyle(tag).outlineWidth).toBe("3px");
    await expect.poll(() => getComputedStyle(tag).outlineColor).toBe(tokenRgb("focus"));
  },
);

test("renders the caller's icon hidden from assistive technology", async () => {
  const screen = await render(
    <Tag tone="info" icon={<svg data-testid="pin-icon" />}>
      PIN
    </Tag>,
  );

  const icon = screen.container.querySelector("[data-testid='pin-icon']") as SVGElement;
  expect(icon).not.toBeNull();
  expect(icon.closest("[aria-hidden='true']")).not.toBeNull();
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

test("the status variant leads its text with a dot in the tone's own color, hidden from assistive technology", async () => {
  const screen = await render(
    <Tag tone="neutral" variant="status">
      Inactiva
    </Tag>,
  );
  const tag = screen.getByText("Inactiva").element() as HTMLElement;
  const dot = tag.firstElementChild as HTMLElement;

  expect(dot).not.toBeNull();
  expect(dot.getAttribute("aria-hidden")).toBe("true");
  expect(dot.textContent).toBe("");
  expect(getComputedStyle(dot).backgroundColor).toBe(tokenRgb("neutral"));
  expect(getComputedStyle(dot).borderRadius).not.toBe("0px");
  const dotBox = dot.getBoundingClientRect();
  expect(dotBox.width).toBeGreaterThan(0);
  expect(dotBox.height).toBe(dotBox.width);
  expect(getComputedStyle(tag).backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(getComputedStyle(tag).color).toBe(tokenRgb("text-subtle"));
});

test("the status variant keeps the plain tag's height, so it fits inside a field", async () => {
  const screen = await render(
    <>
      <Tag tone="neutral">Caja</Tag>
      <Tag tone="neutral" variant="status">
        Inactiva
      </Tag>
    </>,
  );
  const plain = screen.getByText("Caja").element() as HTMLElement;
  const status = screen.getByText("Inactiva").element() as HTMLElement;

  expect(status.getBoundingClientRect().height).toBe(plain.getBoundingClientRect().height);
});

test("the status variant passes the accessibility checks", async () => {
  const screen = await render(
    <main>
      <Tag tone="neutral" variant="status">
        Inactiva
      </Tag>
      <Tag tone="info" variant="status">
        Nueva
      </Tag>
      <Tag tone="success" variant="status">
        Vigente
      </Tag>
    </main>,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("the status variant in the info tone colors its dot with the info tone", async () => {
  const screen = await render(
    <Tag tone="info" variant="status">
      Nueva
    </Tag>,
  );
  const tag = screen.getByText("Nueva").element() as HTMLElement;
  const dot = tag.firstElementChild as HTMLElement;

  expect(getComputedStyle(dot).backgroundColor).toBe(tokenRgb("info-soft"));
  expect(getComputedStyle(tag).backgroundColor).toBe(tokenRgb("action-subtle"));
});

test("the status variant in the success tone colors its dot with the success tone", async () => {
  const screen = await render(
    <Tag tone="success" variant="status">
      Vigente
    </Tag>,
  );
  const tag = screen.getByText("Vigente").element() as HTMLElement;
  const dot = tag.firstElementChild as HTMLElement;

  expect(getComputedStyle(dot).backgroundColor).toBe(tokenRgb("success-soft"));
  expect(getComputedStyle(tag).backgroundColor).toBe(tokenRgb("success-subtle"));
  expect(getComputedStyle(tag).color).toBe(tokenRgb("success-strong"));
});

test("the plain variant in the success tone passes the accessibility checks with its icon", async () => {
  const screen = await render(
    <main>
      <Tag tone="success" icon={<svg />}>
        10 % de descuento
      </Tag>
    </main>,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("a plain tag draws no dot", async () => {
  const screen = await render(<Tag tone="neutral">Caja</Tag>);
  const tag = screen.getByText("Caja").element() as HTMLElement;

  expect(tag.children).toHaveLength(0);
});

test("does not accept an icon on a status tag, since its dot takes that place", () => {
  expectTypeOf<{
    tone: "neutral";
    variant: "status";
    icon: ReactElement;
    children: string;
  }>().not.toExtend<TagProps>();
});

test("does not accept a tag without content", () => {
  expectTypeOf<{ tone: "neutral" }>().not.toExtend<TagProps>();
});

test("does not accept a tag without a tone", () => {
  expectTypeOf<{ children: ReactNode }>().not.toExtend<TagProps>();
});

test("accepts only an icon element, not text, as its icon", () => {
  expectTypeOf<{ tone: "info"; icon: string; children: string }>().not.toExtend<TagProps>();
});
