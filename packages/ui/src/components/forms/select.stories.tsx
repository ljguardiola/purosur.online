import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  playArrowKeyFocusesListboxOption,
  playClickExpandsTrigger,
  playHoverListboxOption,
  playHoverSetsDataHovered,
} from "../../test-support/story-interactions";
import { fieldErrorClassName } from "./field-styles";
import type { Option } from "./option";
import { Select } from "./select";

type Role = "administrator" | "shift-lead" | "cashier";

const options: [Option<Role>, Option<Role>, Option<Role>] = [
  { value: "administrator", label: "Administrador" },
  { value: "shift-lead", label: "Responsable de turno" },
  { value: "cashier", label: "Atención de caja" },
];

const optionsWithStatus: [Option<Role>, Option<Role>, Option<Role>] = [
  { value: "administrator", label: "Administrador" },
  { value: "shift-lead", label: "Responsable de turno" },
  { value: "cashier", label: "Atención de caja", status: "Inactivo" },
];

const meta: Meta<typeof Select<Role>> = {
  title: "Components/Select",
  component: Select<Role>,
  args: {
    label: "Rol",
    options,
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Select<Role>>;

function trigger(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: /Rol/ });
}

export const Selected: Story = {
  args: { value: "shift-lead" },
};

export const Placeholder: Story = {
  args: { value: null, placeholder: "Elegí un rol" },
};

export const Hovered: Story = {
  args: { value: "shift-lead" },
  play: playHoverSetsDataHovered(trigger),
};

// Select's own border reacts to react-aria's data-focused, not data-focus-visible: it draws no
// separate outline ring, so the resting-vs-focused border swap alone has to carry that state.
export const Focused: Story = {
  args: { value: "shift-lead" },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(trigger(canvasElement)).toHaveAttribute("data-focused", "true");
  },
};

export const Open: Story = {
  args: { value: "shift-lead" },
  play: playClickExpandsTrigger(trigger),
};

export const OptionHovered: Story = {
  args: { value: "shift-lead" },
  play: playHoverListboxOption(trigger, "Atención de caja"),
};

export const OptionFocusVisible: Story = {
  args: { value: "shift-lead" },
  play: playArrowKeyFocusesListboxOption(trigger, "Atención de caja"),
};

export const Required: Story = {
  args: { value: "shift-lead", required: true },
};

export const Invalid: Story = {
  args: { value: "shift-lead", errorMessage: "Elegí un rol." },
};

function SelectWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Select
        label="Rol"
        options={options}
        value="shift-lead"
        onChange={() => {}}
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Elegí un rol.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <SelectWithMessageElsewhere />,
};

export const Disabled: Story = {
  args: { value: "shift-lead", disabled: true },
};

export const HelperText: Story = {
  args: { value: "shift-lead", description: "Define qué puede hacer esta persona." },
};

export const SelectedWithStatus: Story = {
  args: { options: optionsWithStatus, value: "cashier" },
};

export const OpenWithStatus: Story = {
  args: { options: optionsWithStatus, value: "cashier" },
  play: playClickExpandsTrigger(trigger),
};

export const LongLabelWithStatus: Story = {
  args: {
    options: [
      {
        value: "cashier",
        label: "Atención de caja en el turno de la tarde y de la noche",
        status: "Inactivo",
      },
    ],
    value: "cashier",
  },
};
