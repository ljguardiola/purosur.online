import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { useRequestForm } from "./request-form";

const PIN_MESSAGE = "El PIN tiene que tener al menos 6 dígitos.";

function PinProbe({ onSubmit }: { onSubmit: (pin: string) => Promise<void> }) {
  const { form, submit } = useRequestForm({
    defaultValues: { pin: "" },
    request: {
      schema: z.object({ pin: z.string().regex(/^\d{6,}$/) }),
      from: ({ pin }) => ({ pin }),
    },
    fields: { pin: "pin" },
    messages: { pin: PIN_MESSAGE },
    onSubmit: (request) => onSubmit(request.pin),
  });
  return (
    <>
      <form.AppField name="pin">
        {(field) => <field.PinDotsField label="PIN nuevo" digitsKeycap={false} />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Guardar
      </button>
    </>
  );
}

test("a PIN dots field shows its field's message under it after a failed submit and clears it once the PIN typed is valid", async () => {
  const screen = await render(<PinProbe onSubmit={() => Promise.resolve()} />);
  const input = screen.getByLabelText("PIN nuevo", { exact: true });

  await userEvent.type(input, "123");
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

  await expect.element(screen.getByText(PIN_MESSAGE)).toBeVisible();
  await expect.element(input).toHaveAccessibleDescription(PIN_MESSAGE);
  await expect.element(input).toHaveAttribute("aria-invalid", "true");
  const box = input.element().parentElement as HTMLElement;
  const message = screen.getByText(PIN_MESSAGE).element();
  expect(message.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    box.getBoundingClientRect().bottom,
  );
  await expectNoAccessibilityViolations(screen.container);

  await userEvent.type(input, "456");

  await expect.element(screen.getByText(PIN_MESSAGE)).not.toBeInTheDocument();
  await expect.element(input).not.toHaveAttribute("aria-invalid");
});

test("a PIN dots field submits the digits typed into it", async () => {
  const onSubmit = vi.fn<(pin: string) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<PinProbe onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText("PIN nuevo", { exact: true }), "482915");
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith("482915");
});
