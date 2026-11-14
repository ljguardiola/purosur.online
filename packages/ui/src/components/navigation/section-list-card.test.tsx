import { Laptop, Printer } from "lucide-react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { SectionListCard, type SectionListCardProps } from "./section-list-card";

const items: SectionListCardProps["items"] = [
  {
    id: "printer",
    icon: <Printer />,
    title: "Impresora",
    statuses: [{ tone: "success", text: "10.10.10.2:9100" }],
  },
  {
    id: "register",
    icon: <Laptop />,
    title: "Esta caja",
    statuses: [
      { tone: "success", text: "Nube conectada" },
      { tone: "warning", text: "1 aviso" },
    ],
  },
];

function renderCard(props: Partial<SectionListCardProps> = {}) {
  return render(
    <div style={{ height: "400px", width: "600px" }}>
      <SectionListCard
        title="Apartados"
        items={items}
        selectedId="register"
        onSelect={() => {}}
        {...props}
      />
    </div>,
  );
}

test("names the list region with its title as a level 2 heading", async () => {
  const screen = await renderCard();

  await expect.element(screen.getByRole("region", { name: "Apartados" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Apartados", level: 2 })).toBeVisible();
  expect(screen.getByRole("list").getByRole("listitem").elements()).toHaveLength(2);
});

test("names each row with its title and its statuses", async () => {
  const screen = await renderCard();

  await expect
    .element(screen.getByRole("button", { name: "Esta caja Nube conectada 1 aviso" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Impresora 10.10.10.2:9100" }))
    .toBeVisible();
});

test("marks only the selected row as the current one", async () => {
  const screen = await renderCard();

  const rows = screen.getByRole("button").elements();
  expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([null, "true"]);
});

test("reports the id of the pressed row", async () => {
  const onSelect = vi.fn();
  const screen = await renderCard({ onSelect });

  await userEvent.click(screen.getByRole("button", { name: /Impresora/ }));

  expect(onSelect).toHaveBeenCalledExactlyOnceWith("printer");
});

test("reports the id of a row activated with the keyboard", async () => {
  const onSelect = vi.fn();
  const screen = await renderCard({ onSelect });

  screen
    .getByRole("button", { name: /Impresora/ })
    .element()
    .focus();
  await userEvent.keyboard("{Enter}");

  expect(onSelect).toHaveBeenCalledExactlyOnceWith("printer");
});

test("draws the selected row on the action tint with a white badge, and the others with a beige badge", async () => {
  const screen = await renderCard();

  const [other, selected] = screen.getByRole("button").elements();
  const badgeOf = (row: Element | undefined) =>
    row?.querySelector("svg")?.parentElement?.parentElement as HTMLElement;

  expect(getComputedStyle(selected as Element).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(getComputedStyle(other as Element).backgroundColor).toBe(tokenRgb("surface"));
  expect(getComputedStyle(badgeOf(selected)).backgroundColor).toBe(tokenRgb("surface"));
  expect(getComputedStyle(badgeOf(other)).backgroundColor).toBe(tokenRgb("neutral-subtle"));
});

test("draws a status dot in the color of each status's tone", async () => {
  const screen = await renderCard();

  const row = screen.getByRole("button", { name: /Esta caja/ }).element();
  const dots = Array.from(row.querySelectorAll("span.rounded-full.size-2"));
  expect(dots.map((dot) => getComputedStyle(dot).backgroundColor)).toEqual([
    tokenRgb("success-soft"),
    tokenRgb("warning-soft"),
  ]);
});

test("hides the icons, dots and separators from assistive technology", async () => {
  const screen = await renderCard();

  const row = screen.getByRole("button", { name: /Esta caja/ }).element();
  for (const svg of row.querySelectorAll("svg")) {
    expect(svg.closest("[aria-hidden=true]")).not.toBeNull();
  }
  expect(row.querySelectorAll("span.size-2[aria-hidden=true]")).toHaveLength(2);
});

test("draws the legend in a footer when given one", async () => {
  const screen = await renderCard({ legend: [{ keyName: "ArrowUpDown", label: "Apartados" }] });

  await expect.element(screen.getByText("Apartados", { exact: true }).last()).toBeVisible();
  expect(screen.getByRole("list").elements()).toHaveLength(2);
});

test("draws no footer without a legend", async () => {
  const screen = await renderCard();

  expect(screen.getByRole("list").elements()).toHaveLength(1);
});

test("fills the height of its container", async () => {
  const screen = await renderCard();

  const region = screen.getByRole("region").element();
  expect(region.getBoundingClientRect().height).toBe(400);
});

test("has no accessibility violations", async () => {
  const screen = await renderCard({ legend: [{ keyName: "ArrowUpDown", label: "Apartados" }] });

  await expectNoAccessibilityViolations(screen.container);
});
