import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  assemblyBatchList,
  infusionsBatch,
  mixBatch,
  voidedBatch,
} from "./test-support/assembly-batches";
import {
  createServices,
  loaded,
  renderScreen,
  rowTexts,
  type Screen,
} from "./test-support/assembly-batches-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const voidMixName = "Anular tanda de Mix de frutos secos";

test("offers the void action only on the batches the cloud says can still be voided", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch, infusionsBatch, voidedBatch]);

  await expect.element(screen.getByRole("button", { name: voidMixName })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Anular tanda de/ }).elements()).toHaveLength(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("marks a voided batch as voided in its row", async () => {
  const services = createServices();
  const screen = await loaded(services, [voidedBatch]);

  await expect.poll(() => rowTexts(screen)[0]).toContain("Anulada");
  expect(screen.getByRole("button", { name: /^Anular tanda de/ }).elements()).toHaveLength(0);
});

test("does not mark a batch that has not been voided", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch, infusionsBatch]);

  await expect.poll(() => rowTexts(screen).length).toBe(2);
  expect(rowTexts(screen).join("")).not.toContain("Anulada");
});

test("the row action opens the question about that batch", async () => {
  const services = createServices();
  const screen = await loaded(services, [infusionsBatch, mixBatch]);

  await userEvent.click(screen.getByRole("button", { name: voidMixName }));

  await expect
    .element(
      screen.getByRole("dialog").getByRole("heading", {
        name: "¿Anular la tanda de Mix de frutos secos?",
      }),
    )
    .toBeVisible();
  expect(services.voidAssemblyBatch).not.toHaveBeenCalled();
});

test("cancel closes the question", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch]);
  await userEvent.click(screen.getByRole("button", { name: voidMixName }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

async function confirmVoid(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: voidMixName }));
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Anular tanda" }));
}

test("a voided batch is confirmed, the list is read again and shows the batch as voided", async () => {
  const services = createServices();
  vi.mocked(services.voidAssemblyBatch).mockResolvedValue({
    kind: "ok",
    batch: { id: mixBatch.id, voidedAt: "2026-09-16T10:00:00.000Z" },
  });
  const screen = await loaded(services, [mixBatch]);
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([{ ...mixBatch, status: "voided" }]),
  });

  await confirmVoid(screen);

  expect(services.voidAssemblyBatch).toHaveBeenCalledWith(mixBatch.id);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Tanda anulada")).toBeVisible();
  await expect.element(screen.getByText("Se anuló la tanda de Mix de frutos secos.")).toBeVisible();
  await expect.poll(() => rowTexts(screen)[0]).toContain("Anulada");
  expect(screen.getByRole("button", { name: voidMixName }).query()).toBeNull();
});

test("a batch that was already voided or consumed offers to update the list, which reads it again", async () => {
  const services = createServices();
  vi.mocked(services.voidAssemblyBatch).mockResolvedValue({
    kind: "consumed",
    message: "La tanda ya tuvo consumo: corregila con un ajuste y un recuento.",
  });
  const screen = await loaded(services, [mixBatch]);
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([{ ...mixBatch, status: "consumed" }]),
  });

  await confirmVoid(screen);
  await expect
    .element(screen.getByRole("dialog").getByRole("alert"))
    .toHaveTextContent("La tanda ya tuvo consumo");
  await userEvent.click(screen.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchAssemblyBatches).mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("button", { name: voidMixName }).query()).toBeNull();
});

test("ends the session when voiding finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([mixBatch]),
  });
  vi.mocked(services.voidAssemblyBatch).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("button", { name: voidMixName })).toBeVisible();

  await confirmVoid(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
