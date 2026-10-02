import { createRef, type Ref, useId } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { ScreenHeader, type ScreenHeaderProps } from "./screen-header";

test("shows the eyebrow, then the screen's title as its level-one heading, then the description", async () => {
  const screen = await render(
    <ScreenHeader
      eyebrow="Notebook nueva"
      title="Dar de alta esta caja"
      description="Escribí el código de alta."
    />,
  );
  const eyebrow = screen.getByText("Notebook nueva", { exact: true }).element();
  const title = screen.getByRole("heading", { level: 1, name: "Dar de alta esta caja" }).element();
  const description = screen.getByText("Escribí el código de alta.", { exact: true }).element();

  expect(eyebrow.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    title.getBoundingClientRect().top,
  );
  expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    description.getBoundingClientRect().top,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the eyebrow as the design system's eyebrow", async () => {
  const screen = await render(<ScreenHeader eyebrow="Caja 1" title="Venta en curso" />);
  const style = getComputedStyle(screen.getByText("Caja 1", { exact: true }).element());

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");
  expect(style.color).toBe(tokenRgb("text-eyebrow"));
});

test("draws the title at 32px bold in the accent text color and the description at 16px in subtle text", async () => {
  const screen = await render(
    <ScreenHeader title="Cambiar el PIN" description="Hace falta internet." />,
  );
  const title = getComputedStyle(screen.getByRole("heading", { name: "Cambiar el PIN" }).element());
  const description = getComputedStyle(
    screen.getByText("Hace falta internet.", { exact: true }).element(),
  );

  expect(title.fontSize).toBe("32px");
  expect(title.fontWeight).toBe("700");
  expect(title.color).toBe(tokenRgb("text-accent"));
  expect(description.fontSize).toBe("16px");
  expect(description.fontWeight).toBe("400");
  expect(description.color).toBe(tokenRgb("text-subtle"));
});

test("keeps 6px between the eyebrow, the title and the description", async () => {
  const screen = await render(
    <ScreenHeader eyebrow="Caja 1" title="Cerrar caja" description="Cierra Ana." />,
  );
  const eyebrow = screen.getByText("Caja 1", { exact: true }).element().getBoundingClientRect();
  const title = screen.getByRole("heading", { name: "Cerrar caja" }).element();
  const titleRect = title.getBoundingClientRect();
  const description = screen
    .getByText("Cierra Ana.", { exact: true })
    .element()
    .getBoundingClientRect();

  expect(titleRect.top - eyebrow.bottom).toBeCloseTo(6, 0);
  expect(description.top - titleRect.bottom).toBeCloseTo(6, 0);
});

test("shows only the title when it is given no eyebrow and no description", async () => {
  const screen = await render(<ScreenHeader title="¿Qué querés hacer?" />);
  const title = screen.getByRole("heading", { name: "¿Qué querés hacer?" }).element();

  expect(screen.container.textContent).toBe("¿Qué querés hacer?");
  expect(title.parentElement?.childElementCount).toBe(1);

  await expectNoAccessibilityViolations(screen.container);
});

test("gives the title the id it is given, so a part of the screen can be named by it", async () => {
  const screen = await render(<SectionNamedByTheTitle />);

  await expect
    .element(screen.getByRole("region", { name: "Caja bloqueada" }))
    .toHaveTextContent("PIN");
});

test("lets the screen move focus to the title through its ref, without putting the title in the tab order", async () => {
  const titleRef = createRef<HTMLHeadingElement>();
  const screen = await render(<ScreenHeader title="¿Quién abre la caja?" titleRef={titleRef} />);
  const title = screen.getByRole("heading", { name: "¿Quién abre la caja?" }).element();

  titleRef.current?.focus();

  expect(titleRef.current).toBe(title);
  expect(document.activeElement).toBe(title);
  expect(title.getAttribute("tabindex")).toBe("-1");
  expect(getComputedStyle(title).outlineStyle).toBe("none");

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the title out of focus when the screen takes no ref to it", async () => {
  const screen = await render(<ScreenHeader title="Venta en curso" />);
  const title = screen.getByRole("heading", { name: "Venta en curso" }).element() as HTMLElement;

  title.focus();

  expect(title.hasAttribute("tabindex")).toBe(false);
  expect(document.activeElement).not.toBe(title);
});

test("lets the screen's frame focus a focusable title, out of the tab order, with the focus ring when focus arrives by keyboard", async () => {
  const screen = await render(
    <>
      <button type="button">Ingresar</button>
      <ScreenHeader title="Ingresar al backoffice" focusableTitle />
    </>,
  );
  const title = screen
    .getByRole("heading", { name: "Ingresar al backoffice" })
    .element() as HTMLElement;

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button").element());
  await userEvent.tab();
  expect(document.activeElement).not.toBe(title);

  title.focus();

  expect(document.activeElement).toBe(title);
  expect(title.getAttribute("tabindex")).toBe("-1");
  const style = getComputedStyle(title);
  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("3px");
  expect(style.outlineColor).toBe(tokenRgb("focus"));

  await expectNoAccessibilityViolations(screen.container);
});

test("draws no focus ring on a focusable title focused after a pointer press", async () => {
  const screen = await render(
    <>
      <button type="button">Ingresar</button>
      <ScreenHeader title="Ingresar al backoffice" focusableTitle />
    </>,
  );
  const title = screen
    .getByRole("heading", { name: "Ingresar al backoffice" })
    .element() as HTMLElement;

  await userEvent.click(screen.getByRole("button"));
  title.focus();

  expect(document.activeElement).toBe(title);
  expect(getComputedStyle(title).outlineStyle).toBe("none");
});

test("wraps a long title and description inside its container instead of overflowing it", async () => {
  const longTitle = "Un título largo que no entra en una sola línea";
  const longDescription =
    "Una descripción larga que no entra en una sola línea dentro de este espacio angosto";
  const screen = await render(
    <div style={{ width: "240px" }}>
      <ScreenHeader eyebrow="Caja 1" title={longTitle} description={longDescription} />
    </div>,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const right = container.getBoundingClientRect().right;

  for (const text of [longTitle, longDescription]) {
    const element = screen.getByText(text, { exact: true }).element();
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);

    expect(element.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 1.5);
    expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(right);
  }
});

function SectionNamedByTheTitle() {
  const titleId = useId();
  return (
    <>
      <ScreenHeader title="Caja bloqueada" titleId={titleId} />
      <section aria-labelledby={titleId}>PIN</section>
    </>
  );
}

test("does not accept a screen header without its title", () => {
  expectTypeOf<{ eyebrow: string; description: string }>().not.toExtend<ScreenHeaderProps>();
});

test("accepts an eyebrow, a description and a title ref a screen may or may not have at hand", () => {
  expectTypeOf<{
    title: string;
    eyebrow: string | undefined;
    description: string | undefined;
    titleRef: Ref<HTMLHeadingElement> | undefined;
    focusableTitle: boolean | undefined;
  }>().toExtend<ScreenHeaderProps>();
});
