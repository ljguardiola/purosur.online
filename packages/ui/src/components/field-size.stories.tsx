import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateField } from "./DateField";
import { FieldGroup } from "./FieldGroup";
import { FieldSizeProvider } from "./FieldSize";
import { QuantityUnitField } from "./QuantityUnitField";
import { Select } from "./Select";
import { TextField } from "./TextField";

const meta: Meta<typeof FieldSizeProvider> = {
  title: "Components/FieldSizeProvider",
  component: FieldSizeProvider,
};

export default meta;

type Story = StoryObj<typeof FieldSizeProvider>;

function SampleFields() {
  return (
    <div className="flex flex-col gap-4">
      <TextField kind="plain-text" label="Motivo" value="" onChange={() => {}} />
      <DateField label="Vencimiento" value={null} onChange={() => {}} />
      <Select
        label="Rol"
        options={[{ value: "a", label: "Administrador" }]}
        value="a"
        onChange={() => {}}
      />
      <FieldGroup label="Categoría">
        <p>Miel</p>
      </FieldGroup>
      <QuantityUnitField
        label="Contenido neto"
        quantity="380"
        onQuantityChange={() => {}}
        unit="g"
        onUnitChange={() => {}}
        options={[{ id: "g", label: "g" }]}
        unitLabel="Unidad"
      />
    </div>
  );
}

export const Register: Story = {
  args: { size: "register" },
  render: (args) => (
    <FieldSizeProvider {...args}>
      <SampleFields />
    </FieldSizeProvider>
  ),
};

export const Backoffice: Story = {
  args: { size: "backoffice" },
  render: (args) => (
    <FieldSizeProvider {...args}>
      <SampleFields />
    </FieldSizeProvider>
  ),
};
