import type { AreaTabPart } from "./area-tabs";
import {
  canSeeAiCostReport,
  canSeeBranchArea,
  canSeeQuarantinedEvents,
  canSeeRolesArea,
  canSeeUsersArea,
} from "./backoffice-access";

export type SettingsTab = "users" | "roles" | "branch" | "held-register-changes" | "ai-cost";

export const SETTINGS_TABS: readonly AreaTabPart<SettingsTab>[] = [
  { key: "users", label: "Usuarios", to: "/people/users", isVisibleTo: canSeeUsersArea },
  { key: "roles", label: "Roles", to: "/people/roles", isVisibleTo: canSeeRolesArea },
  { key: "branch", label: "Sucursal", to: "/branch", isVisibleTo: canSeeBranchArea },
  {
    key: "held-register-changes",
    label: "Cambios de cajas retenidos",
    to: "/held-register-changes",
    isVisibleTo: canSeeQuarantinedEvents,
  },
  { key: "ai-cost", label: "Costo de IA", to: "/ai-cost", isVisibleTo: canSeeAiCostReport },
];
