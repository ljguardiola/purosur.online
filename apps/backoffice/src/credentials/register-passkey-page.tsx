import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { RegisterPasskeyScreen } from "./register-passkey-screen";
import { defaultRegisterPasskeyScreenServices } from "./register-passkey-services";

const route = getRouteApi("/public/account-recovery/passkey");

export function RegisterPasskeyPage(): ReactElement {
  const { services } = route.useRouteContext();
  return (
    <RegisterPasskeyScreen
      services={services.registerPasskeyScreen ?? defaultRegisterPasskeyScreenServices}
    />
  );
}
