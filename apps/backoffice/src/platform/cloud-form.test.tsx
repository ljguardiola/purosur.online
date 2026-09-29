import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { z } from "zod";
import { render } from "../shell/test-support/render-with-router";
import { type CloudSubmission, useCloudForm } from "./cloud-form";

const requestSchema = z.object({
  name: z.string().trim().min(1, "empty").max(5, "long"),
  amount: z.number({ error: "not a number" }),
});

type Values = { name: string; amountText: string };

const NAME_REQUIRED = "Ingresá el nombre.";
const NAME_TOO_LONG = "El nombre es demasiado largo.";
const AMOUNT_INVALID = "Ingresá un monto válido.";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type SubmitHandler = (
  request: z.input<typeof requestSchema>,
  submission: CloudSubmission<Values>,
) => Promise<void>;

function Probe({ onSubmit }: { onSubmit: SubmitHandler }) {
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: { name: "", amountText: "" } satisfies Values,
    request: {
      schema: requestSchema,
      from: (values) => ({ name: values.name, amount: Number(values.amountText) }),
    },
    fields: { name: "name", amount: "amountText" },
    messages: {
      name: (values) => (values.name.trim() === "" ? NAME_REQUIRED : NAME_TOO_LONG),
      amountText: AMOUNT_INVALID,
    },
    onSubmit,
  });
  return (
    <>
      <form.AppField name="name">
        {(field) => <field.TextField kind="plain-text" label="Nombre" />}
      </form.AppField>
      <form.AppField name="amountText">
        {(field) => <field.TextField kind="plain-text" label="Monto" />}
      </form.AppField>
      <button type="button" disabled={submitting} onClick={() => void submit()}>
        Enviar
      </button>
      <button type="button" onClick={() => reset()}>
        Vaciar
      </button>
    </>
  );
}

const noop: SubmitHandler = () => Promise.resolve();

test("does not show an error before the first submit, however the fields are typed", async () => {
  const screen = await render(<Probe onSubmit={noop} />);

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "muy largo");

  await expect.element(screen.getByText(NAME_TOO_LONG)).not.toBeInTheDocument();
});

test("a submit with invalid values shows each field's message and never calls onSubmit", async () => {
  const onSubmit = vi.fn<SubmitHandler>(noop);
  const screen = await render(<Probe onSubmit={onSubmit} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "abc");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText(NAME_REQUIRED)).toBeVisible();
  await expect.element(screen.getByText(AMOUNT_INVALID)).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("a message can depend on the values, so a long name gets its own wording", async () => {
  const screen = await render(<Probe onSubmit={noop} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "muy largo");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "3");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText(NAME_TOO_LONG)).toBeVisible();
});

test("a valid submit calls onSubmit with the request built from the values", async () => {
  const onSubmit = vi.fn<SubmitHandler>(noop);
  const screen = await render(<Probe onSubmit={onSubmit} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: "Ana", amount: 12 });
  expect(onSubmit.mock.calls[0]?.[1].values).toEqual({ name: "Ana", amountText: "12" });
});

test("after a failed submit, changing a field revalidates it on every change", async () => {
  const screen = await render(<Probe onSubmit={noop} />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText(NAME_REQUIRED)).toBeVisible();

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await expect.element(screen.getByText(NAME_REQUIRED)).not.toBeInTheDocument();

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "muy largo");
  await expect.element(screen.getByText(NAME_TOO_LONG)).toBeVisible();
});

test("shows the field the cloud named with the same message, and reports it as known", async () => {
  const known = vi.fn<(known: boolean) => void>();
  const screen = await render(
    <Probe
      onSubmit={(_request, submission) => {
        known(submission.showWireFieldError("amount"));
        return Promise.resolve();
      }}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText(AMOUNT_INVALID)).toBeVisible();
  expect(known).toHaveBeenCalledWith(true);
});

test("a field the form does not know is reported as unknown and shows nothing", async () => {
  const known = vi.fn<(known: boolean) => void>();
  const screen = await render(
    <Probe
      onSubmit={(_request, submission) => {
        known(submission.showWireFieldError("branch_id"));
        return Promise.resolve();
      }}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => known.mock.calls.length).toBe(1);
  expect(known).toHaveBeenCalledWith(false);
  await expect.element(screen.getByText(AMOUNT_INVALID)).not.toBeInTheDocument();
});

test("the message of a field the cloud named follows the values at that moment", async () => {
  const screen = await render(
    <Probe
      onSubmit={(_request, submission) => {
        submission.showWireFieldError("name");
        return Promise.resolve();
      }}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText(NAME_TOO_LONG)).toBeVisible();
});

test("a domain refusal is shown on its field with the message it gives", async () => {
  const screen = await render(
    <Probe
      onSubmit={(_request, submission) => {
        submission.showFieldError("name", "Ya existe.");
        return Promise.resolve();
      }}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Ya existe.")).toBeVisible();
});

test("an error from the cloud clears as soon as its field changes", async () => {
  const screen = await render(
    <Probe
      onSubmit={(_request, submission) => {
        submission.showFieldError("name", "Ya existe.");
        return Promise.resolve();
      }}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Ya existe.")).toBeVisible();

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana B");

  await expect.element(screen.getByText("Ya existe.")).not.toBeInTheDocument();
});

test("an error from the cloud on a field that is left unchanged never blocks the next submit", async () => {
  const onSubmit = vi.fn<SubmitHandler>((_request, submission) => {
    submission.showFieldError("name", "Ya existe.");
    return Promise.resolve();
  });
  const screen = await render(<Probe onSubmit={onSubmit} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Ya existe.")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(3);
});

test("the form is submitting until onSubmit settles", async () => {
  const pending = deferred();
  const screen = await render(<Probe onSubmit={() => pending.promise} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  pending.resolve();
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
});

test("a schema issue outside every declared field blocks the submit", async () => {
  const onSubmit = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const rootSchema = z.object({ name: z.string() }).refine(() => false, "always refused");
  function RootProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { name: "Ana" },
      request: { schema: rootSchema, from: (values) => values },
      fields: { name: "name" },
      messages: { name: "Nombre inválido." },
      onSubmit,
    });
    return (
      <>
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" />}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </>
    );
  }
  const screen = await render(<RootProbe />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("reset returns the fields to their defaults with no errors", async () => {
  const onSubmit = vi.fn<SubmitHandler>(noop);
  const screen = await render(<Probe onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText(NAME_REQUIRED)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Vaciar" }));

  await expect.element(screen.getByText(NAME_REQUIRED)).not.toBeInTheDocument();
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");
  await expect.element(screen.getByText(NAME_TOO_LONG)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
});
