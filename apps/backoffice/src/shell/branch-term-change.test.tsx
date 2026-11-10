import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { BranchTermChange, ReadBranchTermChange } from "./branch-term-change";
import { createBranchTermServices } from "./test-support/branch-term";
import { ADMINISTRATOR_ACCESS, accessWith } from "./test-support/backoffice-access";
import { render } from "./test-support/render-with-router";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function inPage(content: ReactNode) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>{content}</main>
    </FieldSizeProvider>,
  );
}

test.each([
  ["expiringLotAlertDays", 30, "Aviso de vencimiento: 30 días"],
  ["unreviewedPriceAlertDays", 45, "Precio sin revisar: 45 días"],
  ["goodConditionReturnDays", 15, "Cambio en buen estado: 15 días"],
  ["supplierPriceListDailyExtractionCap", 10, "Tope diario de listas: 10"],
] as const)("reads %s as one sentence", async (term, value, sentence) => {
  const screen = await inPage(
    <BranchTermChange
      term={term}
      value={value}
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );

  await expect.element(screen.getByText(sentence)).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("writes a single day in the singular and thousands with the Argentine separator", async () => {
  const one = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={1}
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );
  await expect.element(one.getByText("Aviso de vencimiento: 1 día")).toBeVisible();
  one.unmount();

  const many = await inPage(
    <BranchTermChange
      term="supplierPriceListDailyExtractionCap"
      value={1500}
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );
  await expect.element(many.getByText("Tope diario de listas: 1.500")).toBeVisible();
});

test("shows nothing while the value is not known", async () => {
  const screen = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={undefined}
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );

  expect(screen.getByText(/Aviso de vencimiento/).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Cambiar" }).query()).toBeNull();
});

test("offers Cambiar to someone with the branch capability", async () => {
  const screen = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={30}
      access={accessWith("branch_area")}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );

  await expect.element(screen.getByRole("button", { name: "Cambiar" })).toBeVisible();
});

test("shows the value without Cambiar to someone without the branch capability", async () => {
  const screen = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={30}
      access={accessWith("stock_expiries")}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );

  await expect.element(screen.getByText("Aviso de vencimiento: 30 días")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cambiar" }).query()).toBeNull();
});

test("does not read the branch settings until Cambiar is pressed", async () => {
  const services = createBranchTermServices();
  const screen = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={30}
      access={accessWith("branch_area")}
      onSessionEnded={() => {}}
      services={services}
    />,
  );
  await expect.element(screen.getByRole("button", { name: "Cambiar" })).toBeVisible();

  expect(services.fetchBranchSettings).not.toHaveBeenCalled();
});

test("opens the modal on Cambiar and closes it on Cancelar", async () => {
  const screen = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={30}
      access={accessWith("branch_area")}
      onSessionEnded={() => {}}
      services={createBranchTermServices()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("textbox", { name: "Aviso de vencimiento" }))
    .toHaveValue("30");
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("closes the modal and tells the screen once the value is saved", async () => {
  const onChanged = vi.fn();
  const screen = await inPage(
    <BranchTermChange
      term="expiringLotAlertDays"
      value={30}
      access={accessWith("branch_area")}
      onSessionEnded={() => {}}
      onChanged={onChanged}
      services={createBranchTermServices()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Cambiar" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("textbox", { name: "Aviso de vencimiento" }))
    .toHaveValue("30");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Aviso de vencimiento" }), "60");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  expect(onChanged).toHaveBeenCalledOnce();
});

test("reads the good-condition return days from the cloud", async () => {
  const services = createBranchTermServices({
    fetchGoodConditionReturnDays: vi.fn().mockResolvedValue({ kind: "ok", value: 7 }),
  });
  const screen = await inPage(
    <ReadBranchTermChange
      term="goodConditionReturnDays"
      access={accessWith("refunds_area")}
      onSessionEnded={() => {}}
      services={services}
    />,
  );

  await expect.element(screen.getByText("Cambio en buen estado: 7 días")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cambiar" }).query()).toBeNull();
});

test("reads the daily cap of supplier lists from the cloud", async () => {
  const services = createBranchTermServices({
    fetchSupplierPriceListDailyCap: vi.fn().mockResolvedValue({ kind: "ok", value: 12 }),
  });
  const screen = await inPage(
    <ReadBranchTermChange
      term="supplierPriceListDailyExtractionCap"
      access={accessWith("supplier_price_lists", "branch_area")}
      onSessionEnded={() => {}}
      services={services}
    />,
  );

  await expect.element(screen.getByText("Tope diario de listas: 12")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar" })).toBeVisible();
});

test("shows nothing while the value loads and when it cannot be read", async () => {
  const loading = await inPage(
    <ReadBranchTermChange
      term="goodConditionReturnDays"
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={() => {}}
      services={createBranchTermServices({
        fetchGoodConditionReturnDays: vi.fn().mockReturnValue(new Promise(() => {})),
      })}
    />,
  );
  expect(loading.getByText(/Cambio en buen estado/).query()).toBeNull();
  loading.unmount();

  const failed = await inPage(
    <ReadBranchTermChange
      term="goodConditionReturnDays"
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={() => {}}
      services={createBranchTermServices({
        fetchGoodConditionReturnDays: vi.fn().mockResolvedValue({ kind: "failed" }),
      })}
    />,
  );
  await expect.poll(() => failed.getByText(/Cambio en buen estado/).query()).toBeNull();
});

test("reports the end of the session when the value is read unauthenticated", async () => {
  const onSessionEnded = vi.fn();

  await inPage(
    <ReadBranchTermChange
      term="goodConditionReturnDays"
      access={ADMINISTRATOR_ACCESS}
      onSessionEnded={onSessionEnded}
      services={createBranchTermServices({
        fetchGoodConditionReturnDays: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
      })}
    />,
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
