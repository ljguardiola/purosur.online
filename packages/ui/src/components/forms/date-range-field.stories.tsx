import { CalendarDate } from "@internationalized/date";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
import { expect, userEvent, within } from "storybook/test";
import { playWithClockAt } from "../../test-support/story-interactions";
import { DateRangeField } from "./date-range-field";
import { FieldSizeProvider } from "./field-size";
import { fieldErrorClassName } from "./field-styles";

const meta: Meta<typeof DateRangeField> = {
  title: "Components/DateRangeField",
  component: DateRangeField,
  args: {
    name: "period",
    label: "Período",
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DateRangeField>;

const FEBRUARY = { start: new CalendarDate(2027, 2, 10), end: new CalendarDate(2027, 2, 20) };
const REVERSED = { start: new CalendarDate(2027, 2, 20), end: new CalendarDate(2027, 2, 10) };

const backoffice: Story["decorators"] = [
  (Story) => (
    <FieldSizeProvider size="backoffice">
      <Story />
    </FieldSizeProvider>
  ),
];

function toggle(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button");
}

export const Register: Story = {
  args: { value: null },
};

export const RegisterFilled: Story = {
  args: { value: FEBRUARY },
};

export const Backoffice: Story = {
  args: { value: null },
  decorators: backoffice,
};

export const BackofficeFilled: Story = {
  args: { value: FEBRUARY },
  decorators: backoffice,
};

export const Required: Story = {
  args: { value: null, required: true },
  decorators: backoffice,
};

export const Invalid: Story = {
  args: { value: null, required: true, errorMessage: "Ingresá el período." },
  decorators: backoffice,
};

export const InvalidRegister: Story = {
  args: { value: null, required: true, errorMessage: "Ingresá el período." },
};

function RangeFieldWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <DateRangeField
        name="period"
        label="Período"
        value={null}
        onChange={() => {}}
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Ingresá el período.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <RangeFieldWithMessageElsewhere />,
  decorators: backoffice,
};

export const Reversed: Story = {
  args: { value: REVERSED },
  decorators: backoffice,
};

export const OutOfRange: Story = {
  args: {
    value: { start: new CalendarDate(2027, 2, 20), end: new CalendarDate(2027, 3, 5) },
    minValue: new CalendarDate(2027, 1, 1),
    maxValue: new CalendarDate(2027, 2, 28),
    rangeMessage: "El período debe terminar el 28/02/2027 o antes.",
  },
  decorators: backoffice,
};

export const Disabled: Story = {
  args: { value: FEBRUARY, disabled: true },
  decorators: backoffice,
};

export const HelperText: Story = {
  args: { value: null, description: "Ambos días se incluyen." },
  decorators: backoffice,
};

export const CalendarOpen: Story = {
  args: { value: FEBRUARY },
  decorators: backoffice,
  play: playWithClockAt("2027-03-15T12:00:00Z", async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(within(document.body).getByRole("dialog")).toBeVisible();
  }),
};

export const CalendarOpenRegister: Story = {
  args: { value: FEBRUARY },
  play: playWithClockAt("2027-03-15T12:00:00Z", async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(within(document.body).getByRole("dialog")).toBeVisible();
  }),
};

export const CalendarPeriodAcrossMonths: Story = {
  args: {
    value: { start: new CalendarDate(2027, 2, 24), end: new CalendarDate(2027, 3, 4) },
  },
  decorators: backoffice,
  play: playWithClockAt("2027-04-15T12:00:00Z", async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(within(document.body).getByRole("dialog")).toBeVisible();
  }),
};

export const CalendarOneDayPeriod: Story = {
  args: {
    value: { start: new CalendarDate(2027, 2, 12), end: new CalendarDate(2027, 2, 12) },
  },
  decorators: backoffice,
  play: playWithClockAt("2027-03-15T12:00:00Z", async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(within(document.body).getByRole("dialog")).toBeVisible();
  }),
};
