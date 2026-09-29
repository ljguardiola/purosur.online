import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { CountCard, type CountCardProps } from "./count-card";

test("renders as a link to its address, named by its label, count and detail", async () => {
  const screen = await render(
    <main>
      <CountCard
        label="Alertas críticas"
        count={4}
        tone="error"
        detail="Passkey · Correo"
        href="/home/alerts?level=critical"
      />
    </main>,
  );

  const link = screen.getByRole("link", {
    name: "Alertas críticas 4 Passkey · Correo",
  });
  await expect.element(link).toHaveAttribute("href", "/home/alerts?level=critical");
  await expectNoAccessibilityViolations(document.body);
});

test("writes its count in Argentine Spanish", async () => {
  const screen = await render(<CountCard label="Advertencias" count={1234} tone="warning" />);

  await expect.element(screen.getByText("1.234")).toBeInTheDocument();
});

test("draws the count bold in its tone's strong color, under a bold subtle label", async () => {
  const screen = await render(<CountCard label="Advertencias" count={2} tone="warning" />);

  const count = getComputedStyle(screen.getByText("2").element());
  expect(count.color).toBe(tokenRgb("warning-strong"));
  expect(count.fontWeight).toBe("700");
  const label = getComputedStyle(screen.getByText("Advertencias").element());
  expect(label.color).toBe(tokenRgb("text-subtle"));
  expect(label.fontWeight).toBe("700");
});

test("draws the detail in subtle regular text", async () => {
  const screen = await render(
    <CountCard label="Informativas" count={1} tone="info" detail="Correo" />,
  );

  const detail = getComputedStyle(screen.getByText("Correo").element());
  expect(detail.color).toBe(tokenRgb("text-subtle"));
  expect(detail.fontWeight).toBe("400");
});

test("shows nothing below the count when it has no detail", async () => {
  const screen = await render(
    <CountCard label="Informativas" count={0} tone="info" href="/alerts" />,
  );

  const card = screen.getByRole("link").element();
  expect(card.textContent).toBe("Informativas0");
});

test("sits on the surface with a thin border", async () => {
  const screen = await render(
    <CountCard label="Informativas" count={0} tone="info" href="/alerts" />,
  );

  const card = getComputedStyle(screen.getByRole("link").element());
  expect(card.backgroundColor).toBe(tokenRgb("surface"));
  expect(card.borderTopWidth).toBe("1px");
  expect(card.borderTopColor).toBe(tokenRgb("border"));
});

test("does not accept a card without its label, count or tone", () => {
  expectTypeOf<{ count: number; tone: "info" }>().not.toExtend<CountCardProps>();
  expectTypeOf<{ label: string; tone: "info" }>().not.toExtend<CountCardProps>();
  expectTypeOf<{ label: string; count: number }>().not.toExtend<CountCardProps>();
});

test("accepts only the error, warning and info tones", () => {
  expectTypeOf<{ label: string; count: number; tone: "success" }>().not.toExtend<CountCardProps>();
  expectTypeOf<{ label: string; count: number; tone: "neutral" }>().not.toExtend<CountCardProps>();
});

test("accepts only a number as its count", () => {
  expectTypeOf<{ label: string; count: string; tone: "info" }>().not.toExtend<CountCardProps>();
});
