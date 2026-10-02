import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { useRequestForm } from "./request-form";

const requestSchema = z.object({ code: z.string().min(1) });

type Request = z.input<typeof requestSchema>;

const CODE_MESSAGE = "Revisá el código.";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function refusingShortCodes({ code }: Request): Promise<readonly string[]> {
  return Promise.resolve(code.length === 4 ? [] : ["code"]);
}

function Probe({
  check,
  onSubmit,
}: {
  check: (request: Request) => Promise<readonly string[]>;
  onSubmit: (request: Request) => Promise<void>;
}) {
  const { form, submit, submitting, refused } = useRequestForm({
    defaultValues: { code: "" },
    request: { schema: requestSchema, from: (values) => ({ code: values.code }) },
    fields: { code: "code" },
    messages: { code: CODE_MESSAGE },
    check,
    onSubmit,
  });
  return (
    <>
      <form.AppField name="code">
        {(field) => <field.TextField kind="plain-text" label="Código" />}
      </form.AppField>
      <button type="button" disabled={submitting} onClick={() => void submit()}>
        Enviar
      </button>
      <p>{`Rechazados: ${refused.join(",")}`}</p>
    </>
  );
}

function codeField(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole("textbox", { name: "Código" });
}

test("a submit the check refuses shows the refused field's message and never calls onSubmit", async () => {
  const onSubmit = vi.fn(async () => {});
  const screen = await render(<Probe check={refusingShortCodes} onSubmit={onSubmit} />);
  await userEvent.fill(codeField(screen), "AB");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText(CODE_MESSAGE)).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("a submit the check accepts calls onSubmit with the request it checked", async () => {
  const check = vi.fn(refusingShortCodes);
  const onSubmit = vi.fn(async (_request: Request) => {});
  const screen = await render(<Probe check={check} onSubmit={onSubmit} />);
  await userEvent.fill(codeField(screen), "ABCD");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect
    .poll(() => onSubmit.mock.calls.map(([request]) => request))
    .toEqual([{ code: "ABCD" }]);
  expect(check).toHaveBeenLastCalledWith({ code: "ABCD" });
  await expect.element(screen.getByText(CODE_MESSAGE)).not.toBeInTheDocument();
});

test("the form is submitting while the check is asked", async () => {
  const answer = deferred<readonly string[]>();
  const screen = await render(
    <Probe check={() => answer.promise} onSubmit={() => Promise.resolve()} />,
  );
  await userEvent.fill(codeField(screen), "ABCD");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  answer.resolve([]);

  await expect.element(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
});

test("a refused field keeps its message while the check still refuses what is typed, and drops it once it accepts it", async () => {
  const screen = await render(
    <Probe check={refusingShortCodes} onSubmit={() => Promise.resolve()} />,
  );
  await userEvent.fill(codeField(screen), "AB");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.element(screen.getByText(CODE_MESSAGE)).toBeVisible();

  await userEvent.type(codeField(screen), "C");
  await expect.element(screen.getByText("Rechazados: code")).toBeVisible();
  await expect.element(screen.getByText(CODE_MESSAGE)).toBeVisible();

  await userEvent.type(codeField(screen), "D");

  await expect.element(screen.getByText(CODE_MESSAGE)).not.toBeInTheDocument();
});

test("keeps showing a refused field's message until the check answers for what is typed now", async () => {
  const answers: ReturnType<typeof deferred<readonly string[]>>[] = [];
  const check = () => {
    const answer = deferred<readonly string[]>();
    answers.push(answer);
    return answer.promise;
  };
  const screen = await render(<Probe check={check} onSubmit={() => Promise.resolve()} />);
  await userEvent.fill(codeField(screen), "AB");
  await expect.poll(() => answers.length).toBe(1);
  answers[0]?.resolve(["code"]);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.poll(() => answers.length).toBe(2);
  answers[1]?.resolve(["code"]);
  await expect.element(screen.getByText(CODE_MESSAGE)).toBeVisible();

  await userEvent.type(codeField(screen), "CD");
  await expect.poll(() => answers.length).toBe(4);
  await expect.element(screen.getByText(CODE_MESSAGE)).toBeVisible();
  answers[3]?.resolve([]);

  await expect.element(screen.getByText(CODE_MESSAGE)).not.toBeInTheDocument();
});

test("names the fields the check refuses for what is typed, before any submit", async () => {
  const screen = await render(
    <Probe check={refusingShortCodes} onSubmit={() => Promise.resolve()} />,
  );

  await userEvent.fill(codeField(screen), "AB");
  await expect.element(screen.getByText("Rechazados: code")).toBeVisible();
  await expect.element(screen.getByText(CODE_MESSAGE)).not.toBeInTheDocument();

  await userEvent.fill(codeField(screen), "ABCD");
  await expect.element(screen.getByText("Rechazados:", { exact: true })).toBeVisible();
});

test("ignores a check answered after a newer one was asked", async () => {
  const answers: ReturnType<typeof deferred<readonly string[]>>[] = [];
  const check = () => {
    const answer = deferred<readonly string[]>();
    answers.push(answer);
    return answer.promise;
  };
  const screen = await render(<Probe check={check} onSubmit={() => Promise.resolve()} />);
  await userEvent.fill(codeField(screen), "AB");
  await userEvent.fill(codeField(screen), "ABCD");
  await expect.poll(() => answers.length).toBe(2);

  answers[1]?.resolve([]);
  answers[0]?.resolve(["code"]);

  await expect.element(screen.getByText("Rechazados:", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Rechazados: code")).not.toBeInTheDocument();
});

test("asks no check while the schema itself refuses what is typed, and names no field as refused", async () => {
  const check = vi.fn(refusingShortCodes);
  const screen = await render(<Probe check={check} onSubmit={() => Promise.resolve()} />);
  await userEvent.fill(codeField(screen), "AB");
  await expect.element(screen.getByText("Rechazados: code")).toBeVisible();

  await userEvent.clear(codeField(screen));

  await expect.element(screen.getByText("Rechazados:", { exact: true })).toBeVisible();
  expect(check).not.toHaveBeenCalledWith({ code: "" });
});

test("a check that cannot answer leaves the submit to onSubmit", async () => {
  const onSubmit = vi.fn(async (_request: Request) => {});
  const screen = await render(
    <Probe check={() => Promise.reject(new Error("the core is gone"))} onSubmit={onSubmit} />,
  );
  await userEvent.fill(codeField(screen), "AB");

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect
    .poll(() => onSubmit.mock.calls.map(([request]) => request))
    .toEqual([{ code: "AB" }]);
});
