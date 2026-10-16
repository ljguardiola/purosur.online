import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeBackupsArea, canSeeRegistersArea } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const registersListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "registers",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRegistersArea),
  component: lazyScreen(() => import("./registers-list-page"), "RegistersListPage"),
});

export const snapshotBackupsFilters = z.object({
  register: z.string().default("").catch(""),
});

export type SnapshotBackupsFilters = z.output<typeof snapshotBackupsFilters>;

export const snapshotBackupsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "backups",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeBackupsArea),
  validateSearch: snapshotBackupsFilters,
  search: { middlewares: [stripSearchParams(snapshotBackupsFilters.parse({}))] },
  component: lazyScreen(() => import("./snapshot-backups-page"), "SnapshotBackupsPage"),
});
