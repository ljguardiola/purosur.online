import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { Button } from "../forms/button";
import { ComboBox } from "../forms/combo-box";
import { useRequestForm } from "../forms/request-form/request-form";
import { Select } from "../forms/select";
import { TextField } from "../forms/text-field";
import { Modal } from "./modal";

const CTRL_ENTER = "{Control>}{Enter}{/Control}";

function FormModal({
  open = true,
  title = "Nuevo producto",
  onSend,
  disabled = false,
  disabledReason,
  children,
}: {
  open?: boolean;
  title?: string;
  onSend: () => void;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={() => {}}
      tone="info"
      icon={<Info />}
      title={title}
      footer={
        <>
          <Button variant="secondary" onPress={() => {}}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={disabled}
            {...(disabledReason === undefined ? {} : { disabledReason })}
            onPress={onSend}
          >
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

test("sends the form with Ctrl+Enter pressed from a text field", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend}>
      <NameField />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Nombre" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).toHaveBeenCalledOnce();
});

test("sends the form with Ctrl+Enter pressed from a field of a centered modal", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <Modal
      open
      onOpenChange={() => {}}
      headerLayout="centered"
      tone="info"
      icon={<Info />}
      title="Abrir la caja"
      footer={
        <Button variant="primary" onPress={onSend}>
          Abrir
        </Button>
      }
    >
      <NameField label="Monto inicial" />
    </Modal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Monto inicial" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).toHaveBeenCalledOnce();
});

test("sends the form with Ctrl+Enter pressed from multi-line text", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend}>
      <textarea aria-label="Nota" />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Nota" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).toHaveBeenCalledOnce();
});

test("sends the form with Ctrl+Enter pressed while a select's list is open", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend}>
      <SizeSelect />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("button", { name: /Tamaño/ }));
  await expect.element(screen.getByRole("listbox")).toBeVisible();
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).toHaveBeenCalledOnce();
});

test("sends the form with Ctrl+Enter pressed while a combo box's list is open", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend}>
      <SizeComboBox />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("combobox", { name: "Tamaño" }));
  await userEvent.keyboard("Gr");
  await expect.element(screen.getByRole("listbox")).toBeVisible();
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).toHaveBeenCalledOnce();
});

test("keeps plain Enter in a field from sending the form", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend}>
      <NameField />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Nombre" }));
  await userEvent.keyboard("{Enter}");

  expect(onSend).not.toHaveBeenCalled();
});

test("leaves a field's own Enter handling to plain Enter only", async () => {
  const onFieldEnter = vi.fn();
  const screen = await render(
    <FormModal onSend={() => {}}>
      <input
        aria-label="Código de barras"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onFieldEnter();
          }
        }}
      />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Código de barras" }));
  await userEvent.keyboard(CTRL_ENTER);
  expect(onFieldEnter).not.toHaveBeenCalled();

  await userEvent.keyboard("{Enter}");
  expect(onFieldEnter).toHaveBeenCalledOnce();
});

test("does nothing with Ctrl+Enter while the primary button is disabled", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend} disabled>
      <NameField />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Nombre" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).not.toHaveBeenCalled();
});

test("does nothing with Ctrl+Enter while the primary button says why it is disabled", async () => {
  const onSend = vi.fn();
  const screen = await render(
    <FormModal onSend={onSend} disabledReason="Confirmá cada paso primero.">
      <NameField />
    </FormModal>,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Nombre" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSend).not.toHaveBeenCalled();
});

test("presses nothing with Ctrl+Enter from the footer's own buttons", async () => {
  const onConfirm = vi.fn();
  const screen = await render(
    <Modal
      open
      onOpenChange={() => {}}
      width="confirmation"
      tone="error"
      icon={<Info />}
      title="Anular la venta"
      footer={
        <>
          <Button variant="secondary" onPress={() => {}}>
            Volver
          </Button>
          <Button variant="primary" destructive onPress={onConfirm}>
            Anular
          </Button>
        </>
      }
    >
      La venta queda anulada.
    </Modal>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Volver" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onConfirm).not.toHaveBeenCalled();
});

test("sends only the form of the modal opened over another one", async () => {
  const onSendOuter = vi.fn();
  const onSendInner = vi.fn();
  function Stacked() {
    const [innerOpen, setInnerOpen] = useState(false);
    return (
      <FormModal title="Nuevo producto" onSend={onSendOuter}>
        <Button variant="text" onPress={() => setInnerOpen(true)}>
          Crear una marca
        </Button>
        <FormModal open={innerOpen} title="Nueva marca" onSend={onSendInner}>
          <SizeSelect />
        </FormModal>
      </FormModal>
    );
  }
  const screen = await render(<Stacked />);

  await userEvent.click(screen.getByRole("button", { name: "Crear una marca" }));
  await userEvent.click(screen.getByRole("button", { name: /Tamaño/ }));
  await expect.element(screen.getByRole("listbox")).toBeVisible();
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSendInner).toHaveBeenCalledOnce();
  expect(onSendOuter).not.toHaveBeenCalled();
});

const requestSchema = z.object({ name: z.string().trim().min(1) });
const NAME_REQUIRED = "Ingresá el nombre.";

function RequestFormModal({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { name: "" },
    request: { schema: requestSchema, from: (values) => ({ name: values.name }) },
    fields: { name: "name" },
    messages: { name: NAME_REQUIRED },
    onSubmit,
  });
  return (
    <Modal
      open
      onOpenChange={() => {}}
      tone="info"
      icon={<Info />}
      title="Nueva marca"
      footer={
        <Button variant="primary" disabled={submitting} onPress={() => void submit()}>
          Crear la marca
        </Button>
      }
    >
      <form.AppField name="name">
        {(field) => <field.TextField kind="plain-text" label="Nombre" />}
      </form.AppField>
    </Modal>
  );
}

test("shows the same field error as the primary button when Ctrl+Enter sends a form missing a required field", async () => {
  const onSubmit = vi.fn(async () => {});
  const screen = await render(<RequestFormModal onSubmit={onSubmit} />);

  await userEvent.click(screen.getByRole("textbox", { name: "Nombre" }));
  await userEvent.keyboard(CTRL_ENTER);

  await expect.element(screen.getByText(NAME_REQUIRED)).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("sends no second request with Ctrl+Enter while the form is being sent", async () => {
  let finish: () => void = () => {};
  const onSubmit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(<RequestFormModal onSubmit={onSubmit} />);

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Marca");
  await userEvent.keyboard(CTRL_ENTER);
  await expect.element(screen.getByRole("button", { name: "Crear la marca" })).toBeDisabled();
  await userEvent.keyboard(CTRL_ENTER);
  finish();

  expect(onSubmit).toHaveBeenCalledOnce();
});
