import { useRefreshInstallation } from "../installation/installation-queries";
import { useRefreshRegister } from "../register/register-queries";

export function useRefreshRegisters(): () => Promise<void> {
  const refreshInstallation = useRefreshInstallation();
  const refreshRegister = useRefreshRegister();
  return async () => {
    await Promise.all([refreshInstallation(), refreshRegister()]);
  };
}
