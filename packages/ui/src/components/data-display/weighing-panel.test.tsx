import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { WeighingPanel } from "./weighing-panel";

const weighing = {
  title: "Nueces mariposa",
  detail: "$ 16.400,00 / kg",
  status: "stable" as const,
  onCancel: () => {},
  children: <p>0,172 kg</p>,
};

test("is a region named by the product, with its detail, its status and the cancel button with Esc", async () => {
  const screen = await render(<WeighingPanel {...weighing} />);

  const region = screen.getByRole("region", { name: "Nueces mariposa" });
  await expect.element(region).toBeVisible();
  await expect.element(region.getByRole("heading", { name: "Nueces mariposa" })).toBeVisible();
  await expect.element(region.getByText("$ 16.400,00 / kg")).toBeVisible();
  await expect.element(region.getByText("Estable")).toBeVisible();
  await expect.element(region.getByText("0,172 kg")).toBeVisible();
  const cancel = region.getByRole("button", { name: "Cancelar", exact: true });
  expect(cancel.element().querySelector("kbd")?.textContent).toBe("Esc");
  await expectNoAccessibilityViolations(screen.container);
});

test("reports a press on the cancel button", async () => {
  const onCancel = vi.fn();
  const screen = await render(<WeighingPanel {...weighing} onCancel={onCancel} />);

  await screen.getByRole("button", { name: "Cancelar" }).click();

  expect(onCancel).toHaveBeenCalledOnce();
});

test("shows the moving status", async () => {
  const screen = await render(<WeighingPanel {...weighing} status="moving" />);

  await expect.element(screen.getByText("Moviéndose")).toBeVisible();
  await expect.element(screen.getByText("Estable")).not.toBeInTheDocument();
});

test("shows only the title when it has no detail", async () => {
  const screen = await render(<WeighingPanel {...weighing} detail={undefined} />);

  await expect.element(screen.getByRole("heading", { name: "Nueces mariposa" })).toBeVisible();
  await expect.element(screen.getByText("/ kg", { exact: false })).not.toBeInTheDocument();
});

test("draws on the warning surface", async () => {
  const screen = await render(<WeighingPanel {...weighing} />);

  expect(getComputedStyle(screen.getByRole("region").element()).backgroundColor).toBe(
    tokenRgb("warning-subtle"),
  );
});

test("shows what waits below a dotted line on the plain surface", async () => {
  const screen = await render(<WeighingPanel {...weighing} waiting={<p>Aceite</p>} />);

  const waiting = screen.getByText("Aceite").element().parentElement as HTMLElement;
  await expect.element(screen.getByText("Aceite")).toBeVisible();
  expect(getComputedStyle(waiting).borderTopStyle).toBe("dotted");
  expect(getComputedStyle(waiting).backgroundColor).toBe(tokenRgb("surface"));
  await expectNoAccessibilityViolations(screen.container);
});

test("draws no dotted line when nothing waits", async () => {
  const screen = await render(<WeighingPanel {...weighing} />);

  const dotted = Array.from(screen.container.querySelectorAll("*")).filter(
    (element) => getComputedStyle(element).borderTopStyle === "dotted",
  );
  expect(dotted).toEqual([]);
});

test("keeps its whole content in view beside a sibling that fills a short column", async () => {
  const screen = await render(
    <div style={{ display: "flex", flexDirection: "column", height: "200px" }}>
      <WeighingPanel {...weighing} waiting={<p>Aceite de oliva extra virgen 500 ml</p>} />
      <div style={{ flex: "1 1 0%", minHeight: "600px" }} />
    </div>,
  );

  const region = screen.getByRole("region", { name: "Nueces mariposa" }).element();
  expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight);
});
