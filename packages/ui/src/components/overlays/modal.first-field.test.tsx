import { CalendarDate } from "@internationalized/date";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Button } from "../forms/button";
import { ButtonLink } from "../forms/button-link";
import { ComboBox } from "../forms/combo-box";
import { DateField } from "../forms/date-field";
import { SegmentedControl } from "../forms/segmented-control";
import { Select } from "../forms/select";
import { TextField } from "../forms/text-field";
import { Modal } from "./modal";

const CTRL_ENTER = "{Control>}{Enter}{/Control}";

function FormModal({
  open = true,
  onOpenChange = () => {},
  title = "Nueva marca",
  onSend = () => {},
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  onSend?: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      closable
      tone="info"
      icon={<Info />}
      title={title}
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onPress={onSend}>
            Crear
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

function NameField({ label = "Nombre" }: { label?: string }) {
  const [value, setValue] = useState("");
  return <TextField kind="plain-text" label={label} value={value} onChange={setValue} />;
}

const SIZE_OPTIONS = [
  { value: "small", label: "Chico" },
  { value: "large", label: "Grande" },
] as const;

function SizeSelect() {
  const [value, setValue] = useState<"small" | "large" | null>(null);
  return (
    <Select name="size" label="Tamaño" options={SIZE_OPTIONS} value={value} onChange={setValue} />
  );
}

function SizeComboBox() {
  const [value, setValue] = useState<"small" | "large" | null>(null);
  return <ComboBox label="Tamaño" options={SIZE_OPTIONS} value={value} onChange={setValue} />;
}

function SizeSegmentedControl() {
  const [value, setValue] = useState<"small" | "large">("large");
  return (
    <SegmentedControl label="Tamaño" options={SIZE_OPTIONS} value={value} onChange={setValue} />
  );
}

function ExpiryField() {
  const [value, setValue] = useState<CalendarDate | null>(new CalendarDate(2026, 3, 15));
  return <DateField name="expiry" label="Vencimiento" value={value} onChange={setValue} />;
}

test("opens focused on the body's first text field, past the links and buttons before it", async () => {
  const screen = await render(
    <FormModal>
      <ButtonLink variant="text" href="#ayuda">
        Ver la ayuda
      </ButtonLink>
      <Button variant="secondary" onPress={() => {}}>
        Recargar
      </Button>
      <NameField />
      <NameField label="Descripción" />
    </FormModal>,
  );

  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();
});

test("lets the person type in the first field right after it opens", async () => {
  const screen = await render(
    <FormModal>
      <NameField />
    </FormModal>,
  );

  await userEvent.keyboard("Acme");

  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Acme");
});

test("opens focused on a combobox when it is the first field", async () => {
  const screen = await render(
    <FormModal>
      <SizeComboBox />
      <NameField />
    </FormModal>,
  );

  await expect.element(screen.getByRole("combobox", { name: "Tamaño" })).toHaveFocus();
});

test("opens focused on a select when it is the first field", async () => {
  const screen = await render(
    <FormModal>
      <SizeSelect />
      <NameField />
    </FormModal>,
  );

  await expect.element(screen.getByRole("button", { name: /Tamaño/ })).toHaveFocus();
});

test("opens focused on the first segment of a date field when it is the first field", async () => {
  const screen = await render(
    <FormModal>
      <ExpiryField />
      <NameField />
    </FormModal>,
  );

  const firstSegment = screen.getByRole("spinbutton").first();
  await expect.element(firstSegment).toHaveFocus();
});

test("opens focused on the chosen option when a radio group is the first field", async () => {
  const screen = await render(
    <FormModal>
      <SizeSegmentedControl />
      <NameField />
    </FormModal>,
  );

  await expect.element(screen.getByRole("radio", { name: "Grande" })).toHaveFocus();
});

test("keeps the focus on the dialog when the body holds only links and buttons", async () => {
  const screen = await render(
    <FormModal>
      <ButtonLink variant="text" href="#ayuda">
        Ver la ayuda
      </ButtonLink>
      <Button variant="secondary" onPress={() => {}}>
        Recargar
      </Button>
    </FormModal>,
  );

  await expect.element(screen.getByRole("dialog")).toHaveFocus();
});

test("keeps the focus on the dialog when the body holds only text", async () => {
  const screen = await render(<FormModal>¿Desactivar la marca Acme?</FormModal>);

  await expect.element(screen.getByRole("dialog")).toHaveFocus();
});

function LateField({ shown }: { shown: boolean }) {
  return shown ? <NameField /> : <p>Cargando…</p>;
}

test("moves the focus to a field that appears after opening while the dialog still holds it", async () => {
  const screen = await render(
    <FormModal>
      <LateField shown={false} />
    </FormModal>,
  );
  await expect.element(screen.getByRole("dialog")).toHaveFocus();

  await screen.rerender(
    <FormModal>
      <LateField shown />
    </FormModal>,
  );

  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();
});

test("leaves the focus where the person moved it when a field appears later", async () => {
  const screen = await render(
    <FormModal>
      <LateField shown={false} />
    </FormModal>,
  );
  await expect.element(screen.getByRole("dialog")).toHaveFocus();
  await userEvent.tab();
  const focusedBefore = document.activeElement;
  expect(focusedBefore).not.toBe(screen.getByRole("dialog").element());

  await screen.rerender(
    <FormModal>
      <LateField shown />
    </FormModal>,
  );
  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toBeVisible();

  expect(document.activeElement).toBe(focusedBefore);
});

function SelfFocusingField() {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    ref.current?.querySelector("input")?.focus();
  }, []);
  return (
    <div ref={ref}>
      <TextField kind="plain-text" label="Peso" value={value} onChange={setValue} />
    </div>
  );
}

test("keeps the focus on a field the body focused itself", async () => {
  const screen = await render(
    <FormModal>
      <NameField />
      <SelfFocusingField />
    </FormModal>,
  );

  await expect.element(screen.getByRole("textbox", { name: "Peso" })).toHaveFocus();
});

test("sends with Ctrl+Enter from the first field it opened focused on", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend}>
      <NameField />
    </FormModal>,
  );
  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();

  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).toHaveBeenCalledTimes(1);
});

test("focuses a stacked modal's first field and gives the focus back to the field below when it closes", async () => {
  function Harness() {
    const [brandOpen, setBrandOpen] = useState(false);
    return (
      <>
        <FormModal title="Nuevo producto">
          <NameField />
          <NameField label="Marca" />
          <Button variant="secondary" onPress={() => setBrandOpen(true)}>
            Crear marca
          </Button>
          <FormModal open={brandOpen} onOpenChange={setBrandOpen} title="Nueva marca">
            <NameField label="Nombre de la marca" />
          </FormModal>
        </FormModal>
      </>
    );
  }

  const screen = await render(<Harness />);
  const brandField = screen.getByRole("textbox", { name: "Marca", exact: true });
  await brandField.click();
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  const brandName = screen.getByRole("textbox", { name: "Nombre de la marca" });
  await expect.element(brandName).toHaveFocus();
  await userEvent.keyboard("Acme");
  await expect.element(brandName).toHaveValue("Acme");

  await screen
    .getByRole("dialog", { name: "Nueva marca" })
    .getByRole("button", { name: "Cancelar" })
    .click();

  await expect
    .element(screen.getByRole("button", { name: "Crear marca" }))
    .toHaveFocus();
});

test("gives the focus back to the combobox whose creation entry opened a stacked modal, when it closes", async () => {
  function Harness() {
    const [brandOpen, setBrandOpen] = useState(false);
    const [value, setValue] = useState<"small" | "large" | null>(null);
    return (
      <FormModal title="Nuevo producto">
        <NameField />
        <ComboBox
          label="Marca"
          options={SIZE_OPTIONS}
          creation={{ recordKind: "marca", onCreate: () => setBrandOpen(true) }}
          value={value}
          onChange={setValue}
        />
        <FormModal open={brandOpen} onOpenChange={setBrandOpen} title="Nueva marca">
          <NameField label="Nombre de la marca" />
        </FormModal>
      </FormModal>
    );
  }

  const screen = await render(<Harness />);
  const brandSelector = screen.getByRole("combobox", { name: "Marca" });
  await userEvent.fill(brandSelector, "Dulcor");
  await screen.getByRole("option", { name: "Crear marca «Dulcor»" }).click();
  await expect.element(screen.getByRole("textbox", { name: "Nombre de la marca" })).toHaveFocus();

  await screen
    .getByRole("dialog", { name: "Nueva marca" })
    .getByRole("button", { name: "Cancelar" })
    .click();

  await expect.element(brandSelector).toHaveFocus();
});
