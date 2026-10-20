import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SupplierPriceListFilePicker } from "./supplier-price-list-file-picker";

const pdf = new File([new Uint8Array(2_516_582)], "lista-septiembre-2026.pdf", {
  type: "application/pdf",
});

test("offers to choose a file while none is chosen", async () => {
  const screen = await render(<SupplierPriceListFilePicker file={null} onChange={() => {}} />);

  await expect.element(screen.getByRole("button", { name: "Elegir un archivo" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Elegir otro archivo" }).query()).toBeNull();
});

test("shows the chosen file by name and size, and offers to choose another", async () => {
  const screen = await render(<SupplierPriceListFilePicker file={pdf} onChange={() => {}} />);

  await expect.element(screen.getByText("lista-septiembre-2026.pdf")).toBeVisible();
  await expect.element(screen.getByText("3 MB")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Elegir otro archivo" })).toBeVisible();
});

test("reports the file the person picks, which only accepts PDF", async () => {
  const onChange = vi.fn();
  const screen = await render(<SupplierPriceListFilePicker file={null} onChange={onChange} />);
  const input = screen.getByLabelText("Archivo PDF");

  await expect.element(input).toHaveAttribute("accept", "application/pdf,.pdf");
  await userEvent.upload(input, pdf);

  expect(onChange).toHaveBeenCalledWith(pdf);
});
