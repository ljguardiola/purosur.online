import type { SignInLookupOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { FoundPerson } from "./first-sign-in-email-step";
import { FirstSignInEmailStep } from "./first-sign-in-email-step";

const ADA: FoundPerson = { kind: "has_pin", user: { id: "u1", first_name: "Ada" } };

function answering(outcome: SignInLookupOutcome | Error) {
  const asked: string[] = [];
  const found: FoundPerson[] = [];
  const lookup = async (email: string) => {
    asked.push(email);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
  return { lookup, asked, found, onFound: (person: FoundPerson) => void found.push(person) };
}

function pending() {
  const asked: string[] = [];
  let finish: (outcome: SignInLookupOutcome) => void = () => {};
  const lookup = (email: string) => {
    asked.push(email);
    return new Promise<SignInLookupOutcome>((resolve) => {
      finish = resolve;
    });
  };
  return { lookup, asked, finish: (outcome: SignInLookupOutcome) => finish(outcome) };
}

async function renderStep(request: Pick<ReturnType<typeof answering>, "lookup" | "onFound">) {
  return render(<FirstSignInEmailStep lookup={request.lookup} onFound={request.onFound} />);
}

type Screen = Awaited<ReturnType<typeof renderStep>>;

async function submitEmail(screen: Screen, email: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), email);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("FirstSignInEmailStep", () => {
  it("asks for the email, saying it needs internet, and offers going back", async () => {
    const screen = await renderStep(answering(ADA));

    await expect
      .element(screen.getByRole("heading", { name: "Ingresar por primera vez" }))
      .toBeVisible();
    await expect.element(screen.getByText("Escribí tu correo. Hace falta internet.")).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Correo" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeVisible();
    const back = screen.getByRole("link", { name: "Volver" });
    expect(back.element().getAttribute("href")).toBe("/sign-in");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends the email as typed when the button is pressed", async () => {
    const request = answering(ADA);
    const screen = await renderStep(request);

    await submitEmail(screen, "Ada@Example.com");

    expect(request.asked).toEqual(["Ada@Example.com"]);
  });

  it("sends the email when Enter is pressed in the field", async () => {
    const request = answering(ADA);
    const screen = await renderStep(request);

    await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), "ada@example.com{Enter}");

    expect(request.asked).toEqual(["ada@example.com"]);
  });

  it.each<FoundPerson>([ADA, { kind: "no_pin", user: { id: "u2", first_name: "Bruno" } }])(
    "hands over the person the core found when they $kind",
    async (person) => {
      const request = answering(person);
      const screen = await renderStep(request);

      await submitEmail(screen, "ada@example.com");

      await expect.poll(() => request.found).toEqual([person]);
    },
  );

  it("keeps the button disabled while the email is being looked up, so it is sent only once", async () => {
    const request = pending();
    const screen = await renderStep({ lookup: request.lookup, onFound: () => {} });

    await submitEmail(screen, "ada@example.com");

    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    request.finish({ kind: "not_found" });
    await expect
      .element(screen.getByText("No hay nadie con ese correo en esta sucursal."))
      .toBeVisible();
    expect(request.asked).toHaveLength(1);
  });

  it("says the email is not valid on the field", async () => {
    const request = answering({ kind: "invalid_email" });
    const screen = await renderStep(request);

    await submitEmail(screen, "ada");

    await expect.element(screen.getByText("Escribí un correo válido.")).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Correo" }))
      .toHaveAttribute("aria-invalid", "true");
    expect(request.found).toEqual([]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says nobody in the branch has that email on the field", async () => {
    const request = answering({ kind: "not_found" });
    const screen = await renderStep(request);

    await submitEmail(screen, "nadie@example.com");

    await expect
      .element(screen.getByText("No hay nadie con ese correo en esta sucursal."))
      .toBeVisible();
    expect(request.found).toEqual([]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says there were too many attempts and when to try again", async () => {
    const screen = await renderStep(answering({ kind: "rate_limited", retry_after_seconds: 90 }));

    await submitEmail(screen, "ada@example.com");

    await expect.element(screen.getByText("Demasiados intentos")).toBeVisible();
    await expect
      .element(screen.getByText("Se puede volver a intentar en 2 minutos."))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says there is no internet connection", async () => {
    const screen = await renderStep(answering({ kind: "unreachable" }));

    await submitEmail(screen, "ada@example.com");

    await expect.element(screen.getByText("Sin conexión a internet")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "El correo se comprueba en línea. Cuando vuelva la conexión se puede seguir.",
        ),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each<{ how: string; request: ReturnType<typeof answering> }>([
    { how: "the core cannot", request: answering({ kind: "unavailable" }) },
    { how: "the request itself fails", request: answering(new Error("the core went away")) },
  ])("says the email could not be looked up when $how", async ({ request }) => {
    const screen = await renderStep(request);

    await submitEmail(screen, "ada@example.com");

    await expect.element(screen.getByText("No se pudo buscar tu correo")).toBeVisible();
    await expect
      .element(
        screen.getByText("Puro Sur no responde en este momento. Probá de nuevo en unos minutos."),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each<SignInLookupOutcome>([
    ADA,
    { kind: "not_found" },
    { kind: "invalid_email" },
    { kind: "unreachable" },
  ])("does not keep the typed email once the lookup answers $kind", async (outcome) => {
    const screen = await renderStep(answering(outcome));

    await submitEmail(screen, "ada@example.com");

    await expect.element(screen.getByRole("textbox", { name: "Correo" })).toHaveValue("");
  });

  it("drops the message once the email is edited", async () => {
    const screen = await renderStep(answering({ kind: "not_found" }));
    await submitEmail(screen, "nadie@example.com");
    await expect
      .element(screen.getByText("No hay nadie con ese correo en esta sucursal."))
      .toBeVisible();

    await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), "a");

    await expect
      .element(screen.getByText("No hay nadie con ese correo en esta sucursal."))
      .not.toBeInTheDocument();
  });
});
