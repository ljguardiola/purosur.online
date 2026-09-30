import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { fieldErrorClassName } from "./field-styles";
import { ToggleChipGroup, type ToggleChipGroupProps } from "./toggle-chip-group";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const options: ToggleChipGroupProps<Day>["options"] = [
  { value: "mon", label: "Lun", accessibleName: "Lunes" },
  { value: "tue", label: "Mar", accessibleName: "Martes" },
  { value: "wed", label: "Mié", accessibleName: "Miércoles" },
  { value: "thu", label: "Jue", accessibleName: "Jueves" },
  { value: "fri", label: "Vie", accessibleName: "Viernes" },
  { value: "sat", label: "Sáb", accessibleName: "Sábado" },
  { value: "sun", label: "Dom", accessibleName: "Domingo" },
];

const meta: Meta<typeof ToggleChipGroup<Day>> = {
  title: "Components/ToggleChipGroup",
  component: ToggleChipGroup<Day>,
  args: {
    label: "Días de la semana",
    options,
    value: ["mon", "wed", "fri"],
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ToggleChipGroup<Day>>;

function chip(name: string) {
  return (canvasElement: HTMLElement) => within(canvasElement).getByRole("button", { name });
}

export const Default: Story = {};

export const NoneSelected: Story = {
  args: { value: [] },
};

export const AllSelected: Story = {
  args: { value: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
};

export const WithDescription: Story = {
  args: { value: [], description: "Sin ningún día marcado, vale todos los días." },
};

export const UnselectedHovered: Story = {
  play: playHoverSetsDataHovered(chip("Martes")),
};

export const SelectedHovered: Story = {
  play: playHoverSetsDataHovered(chip("Lunes")),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible(chip("Lunes")),
};

export const Invalid: Story = {
  args: { value: [], errorMessage: "Elegí al menos un día." },
};

export const InvalidSomeSelected: Story = {
  args: { errorMessage: "Elegí al menos un día." },
};

function GroupWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <ToggleChipGroup
        label="Días de la semana"
        options={options}
        value={[]}
        onChange={() => {}}
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Elegí al menos un día.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <GroupWithMessageElsewhere />,
};

export const Disabled: Story = {
  args: { disabled: true, description: "Sin ningún día marcado, vale todos los días." },
};

export const DisabledNoneSelected: Story = {
  args: { disabled: true, value: [] },
};
