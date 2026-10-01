import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { z } from "zod";
import { TextField } from "../text-field";
import { useRequestForm } from "./request-form";
import { useFieldContext } from "./request-form-context";
import { SharedFieldError } from "./request-form-fields";

const MESSAGE = "La hora de cierre debe ser posterior a la de apertura.";

type Hours = { opensAt: string; closesAt: string };

const requestSchema = z
  .object({ opensAt: z.string(), closesAt: z.string() })
  .refine(({ opensAt, closesAt }) => closesAt > opensAt, { path: ["hours"] });

function HoursInputs() {
  const field = useFieldContext<Hours>();
  const hours = field.state.value;
  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <div className="flex items-start gap-4">
          <TextField
            kind="plain-text"
            label="Abre"
            value={hours.opensAt}
            onChange={(opensAt) => field.handleChange({ ...hours, opensAt })}
            errorMessageId={errorMessageId}
          />
          <TextField
            kind="plain-text"
            label="Cierra"
            value={hours.closesAt}
            onChange={(closesAt) => field.handleChange({ ...hours, closesAt })}
            errorMessageId={errorMessageId}
          />
        </div>
      )}
    </SharedFieldError>
  );
}

function HoursForm({ opensAt, closesAt }: Hours) {
  const { form, submit } = useRequestForm({
    defaultValues: { hours: { opensAt, closesAt } },
    request: {
      schema: requestSchema,
      from: ({ hours }) => hours,
    },
    fields: { opensAt: null, closesAt: null, hours: "hours" },
    messages: { hours: MESSAGE },
    onSubmit: () => Promise.resolve(),
  });
  return (
    <div className="flex flex-col items-start gap-3">
      <form.AppField name="hours">{() => <HoursInputs />}</form.AppField>
      <button type="button" onClick={() => void submit()}>
        Guardar
      </button>
    </div>
  );
}

const meta: Meta<typeof SharedFieldError> = {
  title: "Components/SharedFieldError",
  component: SharedFieldError,
  render: () => <HoursForm opensAt="18:00" closesAt="09:00" />,
};

export default meta;

type Story = StoryObj<typeof SharedFieldError>;

export const Default: Story = {
  render: () => <HoursForm opensAt="09:00" closesAt="18:00" />,
};

export const ShowingError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Guardar" }));
    await expect(await canvas.findByText(MESSAGE)).toBeVisible();
  },
};
