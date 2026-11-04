import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Info } from "lucide-react";
import { Button } from "../forms/button";
import { TextField } from "../forms/text-field";
import { Modal } from "./modal";
import { ModalPart } from "./modal-part";

const meta: Meta<typeof ModalPart> = {
  title: "Components/ModalPart",
  component: ModalPart,
  render: (args) => (
    <Modal
      open
      onOpenChange={() => {}}
      tone="info"
      icon={<Info />}
      title="Editar la receta"
      footer={<Button>Guardar la receta</Button>}
    >
      <div className="flex flex-col gap-6">
        <TextField
          kind="plain-text"
          label="Cantidad de Almendras"
          value="0,4"
          onChange={() => {}}
        />
        <section className="flex flex-col gap-4">
          <ModalPart {...args} />
        </section>
      </div>
    </Modal>
  ),
};

export default meta;

type Story = StoryObj<typeof ModalPart>;

export const InModal: Story = {
  args: {
    action: (
      <Button variant="secondary" icon={<Check />}>
        Guardar el precio
      </Button>
    ),
    children: (
      <>
        <h3 className="font-bold text-body text-text">Precio de venta</h3>
        <TextField
          kind="price"
          label="Precio de venta por kilo"
          prefix="$"
          value="16.000,00"
          onChange={() => {}}
        />
      </>
    ),
  },
};
