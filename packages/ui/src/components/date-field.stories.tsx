import { CalendarDate } from "@internationalized/date";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  playClickExpandsTrigger,
  playHoverSetsDataHovered,
  playPseudoHoverPaintsBoneFill,
  playTabReachesFocusVisible,
} from "../test-support/story-interactions";
import { DateField } from "./DateField";
import { FieldSizeProvider } from "./FieldSize";

const meta: Meta<typeof DateField> = {
  title: "Components/DateField",
  component: DateField,
  args: {
    label: "Vencimiento",
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

type Story = StoryObj<typeof DateField>;

function toggle(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button");
}

function fieldBox(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("group");
}

export const Register: Story = {
  args: { value: null },
};

export const RegisterFilled: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
};

export const Backoffice: Story = {
  args: { value: null },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
};

export const BackofficeFilled: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
};

export const FocusedSegment: Story = {
  args: { value: null },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("group");
    await userEvent.click(group);
    const segment = group.querySelector('[role="spinbutton"]') as HTMLElement;
    await expect(segment).toHaveAttribute("data-focused", "true");
  },
};

export const CalendarToggleFocusVisible: Story = {
  args: { value: null },
  play: playTabReachesFocusVisible(toggle),
};

export const CalendarOpen: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playClickExpandsTrigger(toggle),
};

export const CalendarMonthControlHovered: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: async (context) => {
    await userEvent.click(toggle(context.canvasElement));
    await playHoverSetsDataHovered(
      () => document.body.querySelector('[slot="next"]') as HTMLElement,
    )(context);
  },
};

export const Hovered: Story = {
  args: { value: null },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const HoveredBackoffice: Story = {
  args: { value: null },
  parameters: { pseudo: { hover: true } },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const Disabled: Story = {
  args: { value: null, disabled: true },
};

export const Required: Story = {
  args: { value: null, required: true },
};

export const Invalid: Story = {
  args: { value: null, invalid: true, errorMessage: "Elegí una fecha." },
};

export const OutOfRange: Story = {
  args: {
    value: new CalendarDate(2027, 3, 15),
    minValue: new CalendarDate(2027, 1, 1),
    maxValue: new CalendarDate(2027, 2, 28),
    rangeMessage: "La fecha debe ser 28/02/2027 o anterior.",
  },
};

export const HelperText: Story = {
  args: {
    value: null,
    helperText: "Un vencimiento distinto para el mismo producto se carga como otra línea.",
  },
};
