import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { useDocumentTitle } from "../shell/document-title";
import { publicRoute } from "../shell/public-route";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";
import { AccountRecoveryScreen } from "./account-recovery-screen";
import { canSeeRolesArea, canSeeUsersArea } from "./backoffice-access";
import { MyAccountScreen } from "./my-account-screen";
import { RegisterPasskeyScreen } from "./register-passkey-screen";
import { RolesListScreen } from "./roles-list-screen";
import { SignInScreen } from "./sign-in-screen";
import { UserDetailScreen } from "./user-detail-screen";
import { UsersListScreen } from "./users-list-screen";

export const signInRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "sign-in",
  beforeLoad: ({ context: { session } }) => {
    if (session.kind === "signed-in") {
      throw redirect({ to: "/" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const { session, services, sessionActions } = signInRoute.useRouteContext();
  return (
    <SignInScreen
      openingNotice={session.kind === "signed-out" ? session.notice : undefined}
      onSignedIn={sessionActions.signedIn}
      services={services.signInScreen}
    />
  );
}

export const accountRecoveryRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "account-recovery",
  component: AccountRecoveryPage,
});

function AccountRecoveryPage() {
  const { services } = accountRecoveryRoute.useRouteContext();
  return <AccountRecoveryScreen services={services.accountRecoveryScreen} />;
}

export const registerPasskeyRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "account-recovery/passkey",
  component: RegisterPasskeyPage,
});

function RegisterPasskeyPage() {
  const { services } = registerPasskeyRoute.useRouteContext();
  return <RegisterPasskeyScreen services={services.registerPasskeyScreen} />;
}

export const myAccountRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "users/me",
  component: MyAccountPage,
});

function MyAccountPage() {
  const { session, services, sessionActions } = myAccountRoute.useRouteContext();
  useDocumentTitle("Mi cuenta · Puro Sur");
  return (
    <MyAccountScreen
      displayName={session.displayName}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.myAccountScreen}
    />
  );
}

export const usersListFilters = z.object({
  state: z.enum(["all", "active", "inactive"]).default("all").catch("all"),
});

export type UsersListFilters = z.output<typeof usersListFilters>;

export const usersListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "users",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeUsersArea),
  validateSearch: usersListFilters,
  search: { middlewares: [stripSearchParams(usersListFilters.parse({}))] },
  component: UsersListPage,
});

function UsersListPage() {
  const { session, services, sessionActions } = usersListRoute.useRouteContext();
  const filters = usersListRoute.useSearch();
  const navigate = usersListRoute.useNavigate();
  useDocumentTitle("Usuarios · Puro Sur");
  return (
    <UsersListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.usersListScreen}
    />
  );
}

export const userDetailRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "users/$userId",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeUsersArea),
  component: UserDetailPage,
});

function UserDetailPage() {
  const { session, services, sessionActions } = userDetailRoute.useRouteContext();
  const { userId } = userDetailRoute.useParams();
  useDocumentTitle("Usuarios · Puro Sur");
  return (
    <UserDetailScreen
      userId={userId}
      signedInUserId={session.userId}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.userDetailScreen}
    />
  );
}

export const rolesListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "roles",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRolesArea),
  component: RolesListPage,
});

function RolesListPage() {
  const { services, sessionActions } = rolesListRoute.useRouteContext();
  useDocumentTitle("Roles · Puro Sur");
  return (
    <RolesListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.rolesListScreen}
    />
  );
}
