import { page, userEvent } from "vitest/browser";

export function authorizationDialog() {
  return page.getByRole("dialog", { name: "Autorizar" });
}

export async function chooseAuthorizer(firstName: string) {
  await userEvent.click(authorizationDialog().getByRole("button", { name: /USUARIO/ }));
  await userEvent.click(page.getByRole("option", { name: firstName }));
}

export async function typeAuthorizationPin(pin: string) {
  await userEvent.type(authorizationDialog().getByLabelText("PIN"), pin);
}

export async function authorizeInModal(options: { as?: string; pin: string }) {
  if (options.as !== undefined) {
    await chooseAuthorizer(options.as);
  }
  await typeAuthorizationPin(options.pin);
  await userEvent.keyboard("{Enter}");
}
