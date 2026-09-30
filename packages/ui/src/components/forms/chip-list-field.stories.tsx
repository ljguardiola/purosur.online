import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  playClickExpandsTrigger,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { ChipListField } from "./chip-list-field";
import { fieldErrorClassName } from "./field-styles";
import type { NarrowedOption } from "./option";

type Diet = "organic" | "vegan" | "local" | "gluten-free" | "fair-trade" | "dye-free";

const options: NarrowedOption<Diet, never, "status">[] = [
  { value: "organic", label: "Orgánico" },
  { value: "vegan", label: "Vegano" },
  { value: "local", label: "Producción local" },
  { value: "gluten-free", label: "Sin gluten" },
  { value: "fair-trade", label: "Comercio justo" },
  { value: "dye-free", label: "Sin colorantes", status: "Dado de baja" },
];

const meta: Meta<typeof ChipListField<Diet>> = {
  title: "Components/ChipListField",
  component: ChipListField<Diet>,
  args: {
    label: "Distintivos",
    options,
    value: [],
    onChange: () => {},
    addLabel: "Agregar distintivo",
    create: { label: "Crear distintivo…", onAction: () => {} },
  },
  decorators: [
    (Story) => (
      <div className="w-96 bg-surface p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ChipListField<Diet>>;

function button(name: string): (canvasElement: HTMLElement) => HTMLElement {
  return (canvasElement) => within(canvasElement).getByRole("button", { name });
}

export const Empty: Story = {};

export const Several: Story = {
  args: { value: ["organic", "vegan", "local", "gluten-free", "fair-trade"] },
};

export const WithInactiveItem: Story = {
  args: {
    value: ["organic", "dye-free"],
    description: "“Sin colorantes” está dado de baja. No se ofrece para productos nuevos.",
  },
};

export const Required: Story = {
  args: { value: ["organic"], required: true },
};

export const Disabled: Story = {
  args: { value: ["organic", "vegan"], disabled: true },
};

export const HelperText: Story = {
  args: { value: ["organic"], description: "Se muestran en la ficha del producto." },
};

export const FocusedRemoveButton: Story = {
  args: { value: ["organic", "vegan"] },
  play: playTabReachesFocusVisible(button("Quitar Orgánico")),
};

export const FocusedAddPill: Story = {
  play: playTabReachesFocusVisible(button("Agregar distintivo")),
};

export const MenuOpen: Story = {
  args: { value: ["organic"] },
  play: playClickExpandsTrigger(button("Agregar distintivo")),
};

export const MenuOpenOnlyCreate: Story = {
  args: { value: ["organic", "vegan", "local", "gluten-free", "fair-trade"] },
  play: playClickExpandsTrigger(button("Agregar distintivo")),
};

const withoutCreate: Story["render"] = ({ create: _create, ...args }) => (
  <ChipListField {...args} />
);

export const MenuOpenWithoutCreate: Story = {
  args: { value: ["organic"] },
  render: withoutCreate,
  play: playClickExpandsTrigger(button("Agregar distintivo")),
};

export const NothingToAdd: Story = {
  args: { value: ["organic", "vegan", "local", "gluten-free", "fair-trade"] },
  render: withoutCreate,
};

function ChipListFieldLosingItsOnlyChip() {
  const [value, setValue] = useState<Diet[]>(["dye-free"]);
  return (
    <ChipListField
      label="Distintivos"
      options={options.filter((option) => option.status !== undefined)}
      value={value}
      onChange={setValue}
      addLabel="Agregar distintivo"
    />
  );
}

export const FocusedAfterRemovingTheOnlyChip: Story = {
  render: () => <ChipListFieldLosingItsOnlyChip />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    const group = within(canvasElement).getByRole("group", { name: "Distintivos" });
    await expect(group).toHaveFocus();
    await expect(group.matches(":focus-visible")).toBe(true);
  },
};

export const Invalid: Story = {
  args: { value: [], errorMessage: "Elegí al menos un distintivo." },
};

function ChipListFieldWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <ChipListField
        label="Distintivos"
        options={options}
        value={["organic"]}
        onChange={() => {}}
        addLabel="Agregar distintivo"
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Elegí al menos un distintivo.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <ChipListFieldWithMessageElsewhere />,
};
