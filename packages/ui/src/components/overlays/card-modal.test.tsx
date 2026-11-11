import { ShieldCheck } from "lucide-react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { Button } from "../forms/button";
import { PinDotsField } from "../forms/pin-dots-field";
import { UserSelect } from "../forms/user-select";
import { CardModal, type CardModalProps } from "./card-modal";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function props(overrides: Partial<CardModalProps> = {}): CardModalProps {
  return {
    open: true,
    onOpenChange: () => {},
    icon: <ShieldCheck />,
    title: "Autorizar",
    subtitle: "Falta de cambio",
    closable: true,
    children: (
      <>
        <UserSelect
          label="Usuario"
          options={[{ value: "marta", label: "Marta" }]}
          value="marta"
          onChange={() => {}}
        />
        <PinDotsField label="PIN" value="1234" onChange={() => {}} />
      </>
    ),
    action: (
      <Button fullWidth icon={<ShieldCheck />} keycap="Enter">
        Confirmar
      </Button>
    ),
    ...overrides,
  };
}

test("names the dialog with its title", async () => {
  await render(<CardModal {...props()} />);

  await expect.element(page.getByRole("dialog", { name: "Autorizar" })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("shows the subtitle, the fields and the action", async () => {
  await render(<CardModal {...props()} />);

  await expect.element(page.getByText("Falta de cambio")).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Usuario/ })).toBeVisible();
  await expect.element(page.getByLabelText("PIN", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Confirmar/ })).toBeVisible();
});

test("leaves out the subtitle when there is none", async () => {
  await render(<CardModal {...props({ subtitle: undefined })} />);

  expect(document.body.textContent).not.toContain("Falta de cambio");
});

test("draws a 440px white card over the dimmed backdrop, with no footer bar", async () => {
  await render(<CardModal {...props()} />);

  const dialog = page.getByRole("dialog").element() as HTMLElement;
  const card = dialog.parentElement as HTMLElement;
  expect(card.getBoundingClientRect().width).toBe(440);
  expect(getComputedStyle(card).backgroundColor).toBe(tokenRgb("surface"));
  expect(getComputedStyle(card).paddingLeft).toBe("24px");
  expect(document.querySelector("[data-modal-footer]")).toBeNull();
  const overlay = card.parentElement as HTMLElement;
  expect(getComputedStyle(overlay).position).toBe("fixed");
});

test("closes on Escape", async () => {
  const onOpenChange = vi.fn();
  await render(<CardModal {...props({ onOpenChange })} />);

  await userEvent.keyboard("{Escape}");

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("closes when the Esc keycap button is pressed", async () => {
  const onOpenChange = vi.fn();
  await render(<CardModal {...props({ onOpenChange })} />);

  const closeButton = page.getByRole("button", { name: "Cerrar con Esc", exact: true });
  expect((closeButton.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Esc");
  await userEvent.click(closeButton);

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("shows no close button and ignores Escape when it is not closable", async () => {
  const onOpenChange = vi.fn();
  await render(<CardModal {...props({ closable: false, onOpenChange })} />);

  await userEvent.keyboard("{Escape}");

  expect(onOpenChange).not.toHaveBeenCalled();
  expect(page.getByRole("button", { name: "Cerrar con Esc" }).query()).toBeNull();
});

test("puts the focus in the first field", async () => {
  await render(<CardModal {...props()} />);

  await expect.element(page.getByRole("button", { name: /Usuario/ })).toHaveFocus();
});

test("puts the focus in the PIN field when it is the first field", async () => {
  await render(
    <CardModal
      {...props({ children: <PinDotsField label="PIN" value="" onChange={() => {}} /> })}
    />,
  );

  await expect.element(page.getByLabelText("PIN", { exact: true })).toHaveFocus();
});
