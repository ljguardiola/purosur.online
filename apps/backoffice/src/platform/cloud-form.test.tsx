import type { CalendarDate } from "@internationalized/date";
import { TextField } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { z } from "zod";
import { render } from "../shell/test-support/render-with-router";
import { type CloudSubmission, useCloudForm } from "./cloud-form";
import { SharedFieldError } from "./cloud-form-fields";

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
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type SubmitHandler = (
  request: z.input<typeof requestSchema>,
  submission: CloudSubmission<Values>,
) => Promise<void>;

function Probe({ onSubmit }: { onSubmit: SubmitHandler }) {
  const { form, submit, submitting, reset, values } = useCloudForm({
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
      <p>{`Escrito: ${values.name}`}</p>
    </>
  );
}

const noop: SubmitHandler = () => Promise.resolve();

test("exposes the values as they are typed", async () => {
  const screen = await render(<Probe onSubmit={noop} />);

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");

  await expect.element(screen.getByText("Escrito: Ana")).toBeVisible();
});

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
  const pending = deferred();
  const onSubmit = vi
    .fn<SubmitHandler>(() => pending.promise)
    .mockImplementationOnce((_request, submission) => {
      submission.showFieldError("name", "Ya existe.");
      return Promise.resolve();
    });
  const screen = await render(<Probe onSubmit={onSubmit} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Ya existe.")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  expect(onSubmit).toHaveBeenCalledTimes(2);
  await expect.element(screen.getByText("Ya existe.")).not.toBeInTheDocument();
  pending.resolve();
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
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

test("the form is submitting until onSubmit settles, also when it shows a field error before its first await", async () => {
  const pending = deferred();
  const screen = await render(
    <Probe
      onSubmit={(_request, submission) => {
        submission.showFieldError("name", "Ya existe.");
        return pending.promise;
      }}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await userEvent.fill(screen.getByRole("textbox", { name: "Monto" }), "12");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Ya existe.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  pending.resolve();
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  await expect.element(screen.getByText("Ya existe.")).toBeVisible();
});

test("a failed onSubmit that showed a field error before its first await rejects the submit and keeps the error", async () => {
  const pending = deferred();
  const failed = vi.fn<(error: unknown) => void>();
  const failure = new Error("sin conexión");
  function FailingProbe() {
    const { form, submit, submitting } = useCloudForm({
      defaultValues: { name: "Ana" },
      request: { schema: z.object({ name: z.string() }), from: (values) => values },
      fields: { name: "name" },
      messages: { name: "Nombre inválido." },
      onSubmit: (_request, submission) => {
        submission.showFieldError("name", "Ya existe.");
        return pending.promise;
      },
    });
    return (
      <>
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" />}
        </form.AppField>
        <button type="button" disabled={submitting} onClick={() => void submit().catch(failed)}>
          Enviar
        </button>
      </>
    );
  }
  const screen = await render(<FailingProbe />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  pending.reject(failure);

  await expect.poll(() => failed.mock.calls).toEqual([[failure]]);
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  await expect.element(screen.getByText("Ya existe.")).toBeVisible();
});

test("a schema issue outside every declared field still submits the request, with nothing parsed", async () => {
  const onSubmit = vi.fn<
    (request: { name: string }, submission: CloudSubmission<{ name: string }>) => Promise<void>
  >(() => Promise.resolve());
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

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: "Ana" });
  expect(onSubmit.mock.calls[0]?.[1].parsed).toBeUndefined();
  await expect.element(screen.getByText("Nombre inválido.")).not.toBeInTheDocument();
});

test("refuses a request schema that can only validate asynchronously", async () => {
  const onSubmit = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const refused = vi.fn<(error: unknown) => void>();
  const asyncSchema = z.object({ name: z.string() }).refine(async () => true);
  function AsyncProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { name: "Ana" },
      request: { schema: asyncSchema, from: (values) => values },
      fields: { name: "name" },
      messages: { name: "Nombre inválido." },
      onSubmit,
    });
    return (
      <>
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" />}
        </form.AppField>
        <button type="button" onClick={() => void submit().catch(refused)}>
          Enviar
        </button>
      </>
    );
  }
  const screen = await render(<AsyncProbe />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => refused.mock.calls.length).toBe(1);
  expect(refused.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
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

type VersionedValues = { name: string; version: number };

function VersionedProbe({
  version,
  onSubmit,
}: {
  version: number;
  onSubmit: (submission: CloudSubmission<VersionedValues>) => Promise<void>;
}) {
  const { form, submit, reset } = useCloudForm({
    defaultValues: { name: "Ana", version } satisfies VersionedValues,
    request: {
      schema: z.object({ name: z.string().min(1), version: z.number().int().min(1) }),
      from: (values) => values,
    },
    fields: { name: "name", version: null },
    messages: { name: "Nombre inválido." },
    onSubmit: (_request, submission) => onSubmit(submission),
  });
  return (
    <>
      <form.AppField name="name">
        {(field) => <field.TextField kind="plain-text" label="Nombre" />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
      <button type="button" onClick={() => reset({ name: "Beto", version: 4 })}>
        Cargar
      </button>
    </>
  );
}

test("a request key declared as belonging to no field is reported as unknown by the cloud's name", async () => {
  const known = vi.fn<(known: boolean) => void>();
  const screen = await render(
    <VersionedProbe
      version={1}
      onSubmit={(submission) => {
        known(submission.showWireFieldError("version"));
        return Promise.resolve();
      }}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => known.mock.calls.length).toBe(1);
  expect(known).toHaveBeenCalledWith(false);
  await expect.element(screen.getByText("Nombre inválido.")).not.toBeInTheDocument();
});

test("a schema issue on a key that belongs to no field still submits the request, with nothing parsed", async () => {
  const submitted = vi.fn<(submission: CloudSubmission<VersionedValues>) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const screen = await render(<VersionedProbe version={0} onSubmit={submitted} />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => submitted.mock.calls.length).toBe(1);
  expect(submitted.mock.calls[0]?.[0].values).toEqual({ name: "Ana", version: 0 });
  expect(submitted.mock.calls[0]?.[0].parsed).toBeUndefined();
});

test("a field's own issue still holds the request back alongside an issue outside every field", async () => {
  const submitted = vi.fn<(submission: CloudSubmission<VersionedValues>) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const screen = await render(<VersionedProbe version={0} onSubmit={submitted} />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Nombre inválido.")).toBeVisible();
  expect(submitted).not.toHaveBeenCalled();
});

test("reset with values loads them into the fields and the request", async () => {
  const seen = vi.fn<(values: VersionedValues) => void>();
  const screen = await render(
    <VersionedProbe
      version={1}
      onSubmit={(submission) => {
        seen(submission.values);
        return Promise.resolve();
      }}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Cargar" }));
  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Beto");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => seen.mock.calls.length).toBe(1);
  expect(seen).toHaveBeenCalledWith({ name: "Beto", version: 4 });
});

const ROLE_OPTIONS = [
  { value: "cashier", label: "Caja" },
  { value: "stock", label: "Depósito" },
] as const;

function SelectProbe({ onSubmit }: { onSubmit: (role: string) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { role: "" },
    request: {
      schema: z.object({ role: z.string().min(1) }),
      from: ({ role }) => ({ role }),
    },
    fields: { role: "role" },
    messages: { role: "Elegí un rol." },
    onSubmit: ({ role }) => onSubmit(role),
  });
  return (
    <>
      <form.AppField name="role">
        {(field) => <field.Select label="Rol" options={ROLE_OPTIONS} required />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a select shows its field's message after a failed submit and clears it once an option is chosen", async () => {
  const screen = await render(<SelectProbe onSubmit={() => Promise.resolve()} />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Elegí un rol.")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Rol/ }));
  await userEvent.click(screen.getByRole("option", { name: "Depósito" }));

  await expect.element(screen.getByText("Elegí un rol.")).not.toBeInTheDocument();
});

test("a select submits the option that was chosen", async () => {
  const onSubmit = vi.fn<(role: string) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<SelectProbe onSubmit={onSubmit} />);

  await userEvent.click(screen.getByRole("button", { name: /Rol/ }));
  await userEvent.click(screen.getByRole("option", { name: "Depósito" }));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith("stock");
});

function DirtyProbe() {
  const { form, dirty, reset } = useCloudForm({
    defaultValues: { name: "Ana" },
    request: { schema: z.object({ name: z.string() }), from: (values) => values },
    fields: { name: "name" },
    messages: { name: "Nombre inválido." },
    onSubmit: () => Promise.resolve(),
  });
  return (
    <>
      <form.AppField name="name">
        {(field) => <field.TextField kind="plain-text" label="Nombre" />}
      </form.AppField>
      <button type="button" onClick={() => reset({ name: "Beto" })}>
        Cargar
      </button>
      <button type="button" onClick={() => reset()}>
        Vaciar
      </button>
      <output aria-label="Estado">{dirty ? "editado" : "sin cambios"}</output>
    </>
  );
}

test("the form is not dirty until a value differs from the one it started with", async () => {
  const screen = await render(<DirtyProbe />);
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("sin cambios");

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana B");
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("editado");

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Ana");
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("sin cambios");
});

test("values loaded with reset become the ones the form is compared with", async () => {
  const screen = await render(<DirtyProbe />);
  await userEvent.click(screen.getByRole("button", { name: "Cargar" }));
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("sin cambios");

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Carla");
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("editado");

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "Beto");
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("sin cambios");
});

test("a reset without values goes back to the values the form started with", async () => {
  const screen = await render(<DirtyProbe />);
  await userEvent.click(screen.getByRole("button", { name: "Cargar" }));

  await userEvent.click(screen.getByRole("button", { name: "Vaciar" }));

  await expect.element(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Ana");
  await expect.element(screen.getByLabelText("Estado")).toHaveTextContent("sin cambios");
});

function DateProbe({ onSubmit }: { onSubmit: (date: string) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { day: null as CalendarDate | null },
    request: {
      schema: z.object({ day: z.string().min(1) }),
      from: ({ day }) => ({ day: day?.toString() ?? "" }),
    },
    fields: { day: "day" },
    messages: { day: (values) => (values.day === null ? "Elegí el día." : "Ese día no sirve.") },
    onSubmit: ({ day }) => onSubmit(day),
  });
  return (
    <>
      <form.AppField name="day">
        {(field) => <field.DateField label="Día" required />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

async function typeDay(screen: Awaited<ReturnType<typeof render>>, digits: string) {
  await userEvent.click(
    screen.getByRole("group", { name: /^Día/ }).getByRole("spinbutton").first(),
  );
  await userEvent.keyboard(digits);
}

test("a date field shows its field's message after a failed submit and clears it once a date is typed", async () => {
  const screen = await render(<DateProbe onSubmit={() => Promise.resolve()} />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Elegí el día.")).toBeVisible();

  await typeDay(screen, "01032020");

  await expect.element(screen.getByText("Elegí el día.")).not.toBeInTheDocument();
});

test("a date field submits the date that was typed", async () => {
  const onSubmit = vi.fn<(date: string) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<DateProbe onSubmit={onSubmit} />);

  await typeDay(screen, "01032020");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith("2020-03-01");
});

function PairProbe() {
  const { form, submit } = useCloudForm({
    defaultValues: { opens: "" },
    request: { schema: z.object({ opens: z.string().min(1) }), from: (values) => values },
    fields: { opens: "opens" },
    messages: { opens: "Completá los dos horarios." },
    onSubmit: () => Promise.resolve(),
  });
  return (
    <>
      <form.AppField name="opens">
        {(field) => (
          <SharedFieldError>
            {(errorMessageId) => (
              <>
                <TextField
                  kind="plain-text"
                  label="Abre"
                  value={field.state.value}
                  onChange={field.handleChange}
                  {...(errorMessageId === undefined ? {} : { errorMessageId })}
                />
                <TextField
                  kind="plain-text"
                  label="Cierra"
                  value=""
                  onChange={() => {}}
                  {...(errorMessageId === undefined ? {} : { errorMessageId })}
                />
              </>
            )}
          </SharedFieldError>
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("inputs sharing one field's error are all invalid and described by a single message", async () => {
  const screen = await render(<PairProbe />);
  await expect.element(screen.getByText("Completá los dos horarios.")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Completá los dos horarios.")).toBeVisible();
  for (const name of ["Abre", "Cierra"]) {
    await expect
      .element(screen.getByRole("textbox", { name }))
      .toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByRole("textbox", { name }))
      .toHaveAccessibleDescription("Completá los dos horarios.");
  }
});

test("the shared message goes away once the field changes", async () => {
  const screen = await render(<PairProbe />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Completá los dos horarios.")).toBeVisible();

  await userEvent.fill(screen.getByRole("textbox", { name: "Abre" }), "9:00");

  await expect.element(screen.getByText("Completá los dos horarios.")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("textbox", { name: "Cierra" }))
    .not.toHaveAttribute("aria-invalid", "true");
});

const CONTENT_UNITS = [
  { value: "G", label: "g" },
  { value: "KG", label: "kg" },
] as const;

type ContentUnit = "G" | "KG";

const contentSchema = z.object({
  content: z.object({
    quantity: z.number({ error: "not a number" }).positive(),
    unit: z.enum(["G", "KG"]),
  }),
});

function QuantityProbe({ onSubmit }: { onSubmit: (content: unknown) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { content: { quantity: "", unit: "G" as ContentUnit } },
    request: {
      schema: contentSchema,
      from: ({ content }) => ({
        content: { quantity: Number(content.quantity), unit: content.unit },
      }),
    },
    fields: { content: "content" },
    messages: { content: "Revisá el contenido." },
    onSubmit: ({ content }) => onSubmit(content),
  });
  return (
    <>
      <form.AppField name="content">
        {(field) => (
          <field.QuantityUnitField label="Contenido" options={CONTENT_UNITS} unitLabel="Unidad" />
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a quantity and unit field shows its field's message after a failed submit and clears it once the quantity changes", async () => {
  const screen = await render(<QuantityProbe onSubmit={() => Promise.resolve()} />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Revisá el contenido.")).toBeVisible();

  await userEvent.fill(screen.getByRole("textbox", { name: "Contenido" }), "5");

  await expect.element(screen.getByText("Revisá el contenido.")).not.toBeInTheDocument();
});

test("a quantity and unit field submits the quantity typed and the unit chosen", async () => {
  const onSubmit = vi.fn<(content: unknown) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<QuantityProbe onSubmit={onSubmit} />);

  await userEvent.fill(screen.getByRole("textbox", { name: "Contenido" }), "500");
  await userEvent.click(screen.getByRole("button", { name: /Unidad/ }));
  await userEvent.click(screen.getByRole("option", { name: "kg" }));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith({ quantity: 500, unit: "KG" });
});

const SALE_OPTIONS = [
  { value: "UNIT", label: "Por unidad", description: "Se vende de a uno", icon: <span /> },
  { value: "KG", label: "Por peso", description: "Se pesa", icon: <span /> },
] as const;

function cardLabel(screen: Awaited<ReturnType<typeof render>>, title: string): HTMLElement {
  const input = screen.getByRole("radio", { name: title }).element();
  const label = input.closest("label");
  if (!label) {
    throw new Error(`no label found for radio "${title}"`);
  }
  return label;
}

function CardProbe({ onSubmit }: { onSubmit: (saleUnit: string | null) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { saleUnit: null as "UNIT" | "KG" | null },
    request: {
      schema: z.object({ saleUnit: z.enum(["UNIT", "KG"]) }),
      from: ({ saleUnit }) => ({ saleUnit }),
    },
    fields: { saleUnit: "saleUnit" },
    messages: { saleUnit: "Elegí la unidad de venta." },
    onSubmit: (request) => onSubmit(request.saleUnit),
  });
  return (
    <>
      <form.AppField name="saleUnit">
        {(field) => <field.OptionCardGroup label="Unidad de venta" options={SALE_OPTIONS} />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("an option card group shows its field's message after a failed submit and clears it once a card is chosen", async () => {
  const screen = await render(<CardProbe onSubmit={() => Promise.resolve()} />);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Elegí la unidad de venta.")).toBeVisible();

  await userEvent.click(cardLabel(screen, "Por peso"));

  await expect.element(screen.getByText("Elegí la unidad de venta.")).not.toBeInTheDocument();
});

test("an option card group submits the card that was chosen", async () => {
  const onSubmit = vi.fn<(saleUnit: string | null) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<CardProbe onSubmit={onSubmit} />);

  await userEvent.click(cardLabel(screen, "Por peso"));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith("KG");
});

test("a submit hands onSubmit what the schema read, so the request needs no cast", async () => {
  const parsedSeen = vi.fn<(parsed: unknown) => void>();
  const schema = z.object({ name: z.string().trim().min(1) });
  function ParsedProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { name: "" },
      request: { schema, from: ({ name }) => ({ name }) },
      fields: { name: "name" },
      messages: { name: "Nombre inválido." },
      onSubmit: (_request, { parsed }) => {
        parsedSeen(parsed);
        return Promise.resolve();
      },
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
  const screen = await render(<ParsedProbe />);

  await userEvent.fill(screen.getByRole("textbox", { name: "Nombre" }), "  Ana  ");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => parsedSeen.mock.calls.length).toBe(1);
  expect(parsedSeen).toHaveBeenCalledWith({ name: "Ana" });
});

function NullableSelectProbe() {
  const { form, submit } = useCloudForm({
    defaultValues: { role: null as string | null },
    request: {
      schema: z.object({ role: z.string().min(1) }),
      from: ({ role }) => ({ role: role ?? "" }),
    },
    fields: { role: "role" },
    messages: { role: "Elegí un rol." },
    onSubmit: () => Promise.resolve(),
  });
  return (
    <>
      <form.AppField name="role">
        {(field) => (
          <field.Select label="Rol" placeholder="Elegí un rol" options={ROLE_OPTIONS} required />
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a select with nothing chosen shows its placeholder and its message after a failed submit", async () => {
  const screen = await render(<NullableSelectProbe />);
  await expect
    .element(screen.getByRole("button", { name: /Rol/ }))
    .toHaveTextContent("Elegí un rol");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Elegí un rol.")).toBeVisible();
});

test("a schema issue on a key the request type does not declare shows on the field it is declared for", async () => {
  const schema = z
    .object({ content: z.number() })
    .superRefine((_request, context) =>
      context.addIssue({ code: "custom", path: ["contentQuantity"], message: "refused" }),
    );
  function ExtraKeyProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { content: "1" },
      request: { schema, from: ({ content }) => ({ content: Number(content) }) },
      fields: { content: "content", contentQuantity: "content" },
      messages: { content: "Revisá el contenido." },
      onSubmit: () => Promise.resolve(),
    });
    return (
      <>
        <form.AppField name="content">
          {(field) => <field.TextField kind="plain-text" label="Contenido" />}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </>
    );
  }
  const screen = await render(<ExtraKeyProbe />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Revisá el contenido.")).toBeVisible();
});

test("a nested schema issue shows on the field declared for its dotted path, or else for its top key", async () => {
  const schema = z.object({
    deal: z.object({ buy: z.number().min(2), pay: z.number().min(1) }),
  });
  function NestedKeyProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { buy: "", pay: "" },
      request: {
        schema,
        from: ({ buy, pay }) => ({ deal: { buy: Number(buy), pay: Number(pay) } }),
      },
      fields: { deal: "buy", "deal.pay": "pay" },
      messages: { buy: "Revisá lo que lleva.", pay: "Revisá lo que paga." },
      onSubmit: () => Promise.resolve(),
    });
    return (
      <>
        <form.AppField name="buy">
          {(field) => <field.TextField kind="plain-text" label="Lleva" />}
        </form.AppField>
        <form.AppField name="pay">
          {(field) => <field.TextField kind="plain-text" label="Paga" />}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </>
    );
  }
  const screen = await render(<NestedKeyProbe />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Lleva" }), "3");
  await userEvent.fill(screen.getByRole("textbox", { name: "Paga" }), "0");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Revisá lo que paga.")).toBeVisible();
  expect(screen.getByText("Revisá lo que lleva.").query()).toBeNull();

  await userEvent.fill(screen.getByRole("textbox", { name: "Lleva" }), "1");

  await expect.element(screen.getByText("Revisá lo que lleva.")).toBeVisible();
});

test("a declared field that is not shown does not hold back a valid submit", async () => {
  const onSubmit = vi.fn(() => Promise.resolve());
  function HiddenFieldProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { name: "", hidden: "" },
      request: { schema: z.object({ name: z.string() }), from: ({ name }) => ({ name }) },
      fields: { name: "name", other: "hidden" },
      messages: { name: "Revisá el nombre.", hidden: "Revisá lo oculto." },
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
  const screen = await render(<HiddenFieldProbe />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
});

test("a key can be declared for the field the values at that moment name", async () => {
  function ChosenFieldProbe() {
    const { form, submit } = useCloudForm({
      defaultValues: { shape: "", percent: "5", fixed: "7" },
      request: {
        schema: z.object({ amount: z.number() }),
        from: (values) => ({ amount: Number(values.percent) }),
      },
      fields: { amount: (values) => (values.shape === "fijo" ? "fixed" : "percent") },
      messages: { percent: "Revisá el porcentaje.", fixed: "Revisá el monto fijo." },
      onSubmit: async (_request, { showWireFieldError }) => {
        showWireFieldError("amount");
      },
    });
    return (
      <>
        <form.AppField name="shape">
          {(field) => <field.TextField kind="plain-text" label="Forma" />}
        </form.AppField>
        <form.AppField name="percent">
          {(field) => <field.TextField kind="plain-text" label="Porcentaje" />}
        </form.AppField>
        <form.AppField name="fixed">
          {(field) => <field.TextField kind="plain-text" label="Fijo" />}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </>
    );
  }
  const screen = await render(<ChosenFieldProbe />);
  await userEvent.fill(screen.getByRole("textbox", { name: "Forma" }), "fijo");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Revisá el monto fijo.")).toBeVisible();
  expect(screen.getByText("Revisá el porcentaje.").query()).toBeNull();
});

const DIRECTION_OPTIONS = [
  { value: "add", label: "Suma" },
  { value: "subtract", label: "Resta" },
] as const;

function SegmentProbe({ onSubmit }: { onSubmit: (direction: string) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { direction: "add" as "add" | "subtract" },
    request: {
      schema: z.object({ direction: z.enum(["add", "subtract"]) }),
      from: ({ direction }) => ({ direction }),
    },
    fields: { direction: "direction" },
    messages: { direction: "Elegí el sentido." },
    onSubmit: (request) => onSubmit(request.direction),
  });
  return (
    <>
      <form.AppField name="direction">
        {(field) => <field.SegmentedControl label="Sentido" options={DIRECTION_OPTIONS} />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a segmented control submits the segment that was chosen", async () => {
  const onSubmit = vi.fn<(direction: string) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<SegmentProbe onSubmit={onSubmit} />);

  await userEvent.click(cardLabel(screen, "Resta"));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith("subtract");
});

const DAY_CHIPS = [
  { value: "1", label: "Lun", accessibleName: "Lunes" },
  { value: "2", label: "Mar", accessibleName: "Martes" },
  { value: "3", label: "Mié", accessibleName: "Miércoles" },
] as const;

function ChipsProbe({ onSubmit }: { onSubmit: (days: string[]) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { days: [] as string[] },
    request: {
      schema: z.object({ days: z.array(z.string()).min(1) }),
      from: ({ days }) => ({ days }),
    },
    fields: { days: "days" },
    messages: { days: "Elegí al menos un día." },
    onSubmit: (request) => onSubmit(request.days),
  });
  return (
    <>
      <form.AppField name="days">
        {(field) => <field.ToggleChipGroup label="Días" options={DAY_CHIPS} />}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a toggle chip group shows its field's message after a failed submit and clears it once a chip is chosen", async () => {
  const screen = await render(<ChipsProbe onSubmit={() => Promise.resolve()} />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText("Elegí al menos un día.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Martes" }));

  await expect.poll(() => screen.getByText("Elegí al menos un día.").query()).toBeNull();
});

test("a toggle chip group submits the chips that were chosen, in the order of its options", async () => {
  const onSubmit = vi.fn<(days: string[]) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<ChipsProbe onSubmit={onSubmit} />);

  await userEvent.click(screen.getByRole("button", { name: "Miércoles" }));
  await userEvent.click(screen.getByRole("button", { name: "Lunes" }));
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith(["1", "3"]);
});

function ToggleProbe({ onSubmit }: { onSubmit: (active: boolean) => Promise<void> }) {
  const { form, submit } = useCloudForm({
    defaultValues: { active: false },
    request: { schema: z.object({ active: z.boolean() }), from: ({ active }) => ({ active }) },
    fields: { active: "active" },
    messages: { active: "Revisá el estado." },
    onSubmit: (request) => onSubmit(request.active),
  });
  return (
    <>
      <form.AppField name="active">
        {(field) => (
          <field.Toggle description="Deja de aplicarse al apagarlo.">Se aplica</field.Toggle>
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a toggle shows its state and its description, and submits the state it was left in", async () => {
  const onSubmit = vi.fn<(active: boolean) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<ToggleProbe onSubmit={onSubmit} />);
  await expect.element(screen.getByRole("switch", { name: "Se aplica" })).not.toBeChecked();
  await expect.element(screen.getByText("Deja de aplicarse al apagarlo.")).toBeVisible();

  await userEvent.click(screen.getByText("Se aplica"));
  await expect.element(screen.getByRole("switch", { name: "Se aplica" })).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith(true);
});
