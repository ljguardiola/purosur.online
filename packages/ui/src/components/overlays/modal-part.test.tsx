import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Button } from "../forms/button";
import { Select } from "../forms/select";
import { TextField } from "../forms/text-field";
import { Modal } from "./modal";
import { ModalPart } from "./modal-part";

const CTRL_ENTER = "{Control>}{Enter}{/Control}";

function NameField({ label }: { label: string }) {
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

function RecipeModal({
  onSaveRecipe,
  onSavePrice,
  priceDisabled = false,
  part,
  children,
}: {
  onSaveRecipe: () => void;
  onSavePrice: () => void;
  priceDisabled?: boolean;
  part?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Modal
      open
      onOpenChange={() => {}}
      tone="info"
      icon={<Info />}
      title="Editar la receta"
      footer={
        <Button variant="primary" onPress={onSaveRecipe}>
          Guardar la receta
        </Button>
      }
    >
      <NameField label="Cantidad de Almendras" />
      <ModalPart
        action={
          <Button variant="secondary" disabled={priceDisabled} onPress={onSavePrice}>
            Guardar el precio
          </Button>
        }
      >
        {part ?? <NameField label="Precio de venta" />}
      </ModalPart>
      {children}
    </Modal>
  );
}

test("presses the part's own action with Ctrl+Enter pressed from one of its fields", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  const screen = await render(
    <RecipeModal onSaveRecipe={onSaveRecipe} onSavePrice={onSavePrice} />,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Precio de venta" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSavePrice).toHaveBeenCalledOnce();
  expect(onSaveRecipe).not.toHaveBeenCalled();
});

test("presses the modal's primary action with Ctrl+Enter pressed from a field outside the part", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  const screen = await render(
    <RecipeModal onSaveRecipe={onSaveRecipe} onSavePrice={onSavePrice} />,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Cantidad de Almendras" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSaveRecipe).toHaveBeenCalledOnce();
  expect(onSavePrice).not.toHaveBeenCalled();
});

test("presses the modal's primary action once the focus has left the part", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  const screen = await render(
    <RecipeModal onSaveRecipe={onSaveRecipe} onSavePrice={onSavePrice} />,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Precio de venta" }));
  await userEvent.click(screen.getByRole("textbox", { name: "Cantidad de Almendras" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSaveRecipe).toHaveBeenCalledOnce();
  expect(onSavePrice).not.toHaveBeenCalled();
});

test("presses the part's own action with Ctrl+Enter pressed while its select's list is open", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  const screen = await render(
    <RecipeModal onSaveRecipe={onSaveRecipe} onSavePrice={onSavePrice} part={<SizeSelect />} />,
  );

  await userEvent.click(screen.getByRole("button", { name: /Tamaño/ }));
  await expect.element(screen.getByRole("listbox")).toBeVisible();
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSavePrice).toHaveBeenCalledOnce();
  expect(onSaveRecipe).not.toHaveBeenCalled();
});

test("presses nothing with Ctrl+Enter from the part while its action is disabled", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  const screen = await render(
    <RecipeModal onSaveRecipe={onSaveRecipe} onSavePrice={onSavePrice} priceDisabled />,
  );

  await userEvent.click(screen.getByRole("textbox", { name: "Precio de venta" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSavePrice).not.toHaveBeenCalled();
  expect(onSaveRecipe).not.toHaveBeenCalled();
});

test("sends only the modal opened from within a part over the one below it", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  const onCreateBrand = vi.fn();
  function Stacked() {
    const [innerOpen, setInnerOpen] = useState(false);
    return (
      <RecipeModal
        onSaveRecipe={onSaveRecipe}
        onSavePrice={onSavePrice}
        part={
          <>
            <Button variant="text" onPress={() => setInnerOpen(true)}>
              Crear una marca
            </Button>
            <Modal
              open={innerOpen}
              onOpenChange={() => {}}
              tone="info"
              icon={<Info />}
              title="Nueva marca"
              footer={
                <Button variant="primary" onPress={onCreateBrand}>
                  Crear la marca
                </Button>
              }
            >
              <NameField label="Nombre de la marca" />
            </Modal>
          </>
        }
      />
    );
  }
  const screen = await render(<Stacked />);

  await userEvent.click(screen.getByRole("button", { name: "Crear una marca" }));
  await userEvent.click(screen.getByRole("textbox", { name: "Nombre de la marca" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onCreateBrand).toHaveBeenCalledOnce();
  expect(onSavePrice).not.toHaveBeenCalled();
  expect(onSaveRecipe).not.toHaveBeenCalled();
});

test("presses the part's own action with Ctrl+Enter from its field after a modal opened from it closes", async () => {
  const onSaveRecipe = vi.fn();
  const onSavePrice = vi.fn();
  function Stacked() {
    const [innerOpen, setInnerOpen] = useState(false);
    return (
      <RecipeModal
        onSaveRecipe={onSaveRecipe}
        onSavePrice={onSavePrice}
        part={
          <>
            <NameField label="Precio de venta" />
            <Button variant="text" onPress={() => setInnerOpen(true)}>
              Crear una marca
            </Button>
            <Modal
              open={innerOpen}
              onOpenChange={() => {}}
              tone="info"
              icon={<Info />}
              title="Nueva marca"
              footer={
                <Button variant="primary" onPress={() => setInnerOpen(false)}>
                  Crear la marca
                </Button>
              }
            >
              <NameField label="Nombre de la marca" />
            </Modal>
          </>
        }
      />
    );
  }
  const screen = await render(<Stacked />);

  await userEvent.click(screen.getByRole("button", { name: "Crear una marca" }));
  await userEvent.click(screen.getByRole("button", { name: "Crear la marca" }));
  await userEvent.click(screen.getByRole("textbox", { name: "Precio de venta" }));
  await userEvent.keyboard(CTRL_ENTER);

  expect(onSavePrice).toHaveBeenCalledOnce();
  expect(onSaveRecipe).not.toHaveBeenCalled();
});

test("keeps a part's action pressable with the pointer outside a modal", async () => {
  const onSavePrice = vi.fn();
  const screen = await render(
    <ModalPart
      action={
        <Button variant="secondary" onPress={onSavePrice}>
          Guardar el precio
        </Button>
      }
    >
      <NameField label="Precio de venta" />
    </ModalPart>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio" }));

  expect(onSavePrice).toHaveBeenCalledOnce();
});
