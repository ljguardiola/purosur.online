import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { SpreadsheetDownloadButton } from "./spreadsheet-download-button";

test("is a secondary button that reads Descargar planilla, with its icon hidden from assistive technology", async () => {
  const screen = await render(<SpreadsheetDownloadButton onPress={() => {}} />);

  const button = screen.getByRole("button", { name: "Descargar planilla" }).element();
  expect(button.getAttribute("data-variant")).toBe("secondary");
  expect(button.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("reports a press", async () => {
  const onPress = vi.fn();
  const screen = await render(<SpreadsheetDownloadButton onPress={onPress} />);

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("takes no press while the data it exports is loading or failed", async () => {
  for (const dataStatus of ["loading", "failed"] as const) {
    const onPress = vi.fn();
    const screen = await render(
      <SpreadsheetDownloadButton onPress={onPress} dataStatus={dataStatus} />,
    );

    const button = screen.getByRole("button", { name: "Descargar planilla" });
    await expect.element(button).toBeDisabled();
    await userEvent.click(button, { force: true });
    expect(onPress).not.toHaveBeenCalled();
    await screen.unmount();
  }
});

test("takes no press while the file is being prepared", async () => {
  const onPress = vi.fn();
  const screen = await render(<SpreadsheetDownloadButton onPress={onPress} preparing />);

  const button = screen.getByRole("button", { name: "Descargar planilla" });
  await expect.element(button).toBeDisabled();
  await userEvent.click(button, { force: true });
  expect(onPress).not.toHaveBeenCalled();
});

test("says why it is disabled when given a reason", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <SpreadsheetDownloadButton onPress={onPress} disabledReason="No hay filas para descargar." />,
  );

  const button = screen.getByRole("button", { name: "Descargar planilla" });
  await expect.element(button).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(button, { force: true });
  expect(onPress).not.toHaveBeenCalled();
});
