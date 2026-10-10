import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AccountRecoveryScreen } from "./account-recovery-screen";
import { defaultAccountRecoveryScreenServices } from "./account-recovery-services";

const route = getRouteApi("/public/account-recovery");

export function AccountRecoveryPage(): ReactElement {
  const { services } = route.useRouteContext();
  return (
    <AccountRecoveryScreen
      services={services.accountRecoveryScreen ?? defaultAccountRecoveryScreenServices}
    />
  );
}
