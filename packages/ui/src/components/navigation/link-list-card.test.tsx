import { ShoppingBag } from "lucide-react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { LinkListCard, LinkListRow } from "./link-list-card";

function renderCard() {
  return render(
    <LinkListCard title="Ventas" icon={<ShoppingBag />}>
      <LinkListRow label="Ventas por día o por rango" href="/reports/sales-by-day" />
      <LinkListRow label="Ventas por medio de pago" href="/reports/sales-by-payment-method" />
    </LinkListCard>,
  );
}

test("names its list of links with its title, as a region with a level 2 heading", async () => {
  const screen = await renderCard();

  await expect.element(screen.getByRole("region", { name: "Ventas" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Ventas", level: 2 })).toBeVisible();
  expect(screen.getByRole("list").getByRole("listitem").elements()).toHaveLength(2);
});

test("draws each row as a link to its destination, named by its label alone", async () => {
  const screen = await renderCard();

  const link = screen.getByRole("link", { name: "Ventas por día o por rango" });
  await expect.element(link).toHaveAttribute("href", "/reports/sales-by-day");
  expect(link.element().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("hides the icon of the title from assistive technology", async () => {
  const screen = await renderCard();

  const heading = screen.getByRole("heading", { name: "Ventas" }).element();
  const tile = heading.parentElement?.querySelector("svg")?.parentElement;
  expect(tile?.getAttribute("aria-hidden")).toBe("true");
});

test("draws an outlined card with the surface background and 8px radius", async () => {
  const screen = await renderCard();

  const style = getComputedStyle(screen.getByRole("region").element());
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderRadius).toBe("8px");
});

test("draws a divider between the rows and none below the last one", async () => {
  const screen = await renderCard();

  const [first, second] = screen.getByRole("listitem").elements();
  expect(getComputedStyle(first as Element).borderBottomWidth).toBe("1px");
  expect(getComputedStyle(first as Element).borderBottomColor).toBe(tokenRgb("border"));
  expect(getComputedStyle(second as Element).borderBottomWidth).toBe("0px");
});

test("turns a row subtle on hover", async () => {
  const screen = await renderCard();
  const link = screen.getByRole("link", { name: "Ventas por medio de pago" }).element();

  await userEvent.hover(link);

  await expect.poll(() => getComputedStyle(link).backgroundColor).toBe(tokenRgb("surface-subtle"));
});

test("forwards a style to the link, so a router can apply its own inline styles", async () => {
  const screen = await render(
    <LinkListCard title="Ventas" icon={<ShoppingBag />}>
      <LinkListRow label="Ventas por día" href="/reports/sales-by-day" style={{ opacity: 0.5 }} />
    </LinkListCard>,
  );

  const link = screen.getByRole("link", { name: "Ventas por día" }).element() as HTMLAnchorElement;
  expect(link.style.opacity).toBe("0.5");
});

test("has no accessibility violations", async () => {
  const screen = await renderCard();

  await expectNoAccessibilityViolations(screen.container);
});
