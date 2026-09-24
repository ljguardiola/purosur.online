import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import { LifeBuoy, Settings, Shield, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AccountFooter,
  type AccountFooterServices,
  defaultAccountFooterServices,
} from "./AccountFooter";
import {
  AccountRecoveryScreen,
  type AccountRecoveryScreenServices,
  defaultAccountRecoveryScreenServices,
} from "./AccountRecoveryScreen";
import { type BackofficeAccess, canSeeRolesArea, canSeeUsersArea } from "./access";
import { ACCOUNT_RECOVERY_PATH, REGISTER_PASSKEY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import {
  DuplicateRoleScreen,
  type DuplicateRoleScreenServices,
  defaultDuplicateRoleScreenServices,
} from "./DuplicateRoleScreen";
import {
  defaultEditRoleScreenServices,
  EditRoleScreen,
  type EditRoleScreenServices,
} from "./EditRoleScreen";
import { HelpContent, HelpSectionColumn } from "./HelpScreen";
import { type BackofficeHelpCatalog, type HelpRoute, resolveHelpPath } from "./helpRoutes";
import { linkProps } from "./linkProps";
import {
  defaultMyAccountScreenServices,
  MyAccountScreen,
  type MyAccountScreenServices,
} from "./MyAccountScreen";
import { messages } from "./messages";
import {
  defaultNewRoleScreenServices,
  NewRoleScreen,
  type NewRoleScreenServices,
} from "./NewRoleScreen";
import {
  defaultRegisterPasskeyScreenServices,
  RegisterPasskeyScreen,
  type RegisterPasskeyScreenServices,
} from "./RegisterPasskeyScreen";
import {
  defaultRolesListScreenServices,
  RolesListScreen,
  type RolesListScreenServices,
} from "./RolesListScreen";
import { navigate, onNavigate, useRoute } from "./router";
import { Shell } from "./Shell";
import {
  defaultSignInScreenServices,
  type SignInOpeningNotice,
  SignInScreen,
  type SignInScreenServices,
} from "./SignInScreen";
import { useSessionActivityReporter } from "./sessionActivityReporter";
import { checkSessionStatus, fetchSession } from "./sessionApi";
import { clearSignedInMarker, markSignedIn, wasSignedIn } from "./sessionMarker";
import { useSessionWatcher } from "./sessionWatcher";
import {
  MY_ACCOUNT_PATH,
  matchRoleDuplicatePath,
  matchRoleEditPath,
  matchUserDetailPath,
  NEW_ROLE_PATH,
  ROLES_LIST_PATH,
  USERS_LIST_PATH,
} from "./settingsRoutes";
import {
  defaultUserDetailScreenServices,
  UserDetailScreen,
  type UserDetailScreenServices,
} from "./UserDetailScreen";
import {
  defaultUsersListScreenServices,
  UsersListScreen,
  type UsersListScreenServices,
} from "./UsersListScreen";

export type AppServices = {
  fetchSession: typeof fetchSession;
  checkSessionStatus: typeof checkSessionStatus;
  signInScreen: SignInScreenServices;
  accountRecoveryScreen: AccountRecoveryScreenServices;
  registerPasskeyScreen: RegisterPasskeyScreenServices;
  myAccountScreen: MyAccountScreenServices;
  usersListScreen: UsersListScreenServices;
  userDetailScreen: UserDetailScreenServices;
  rolesListScreen: RolesListScreenServices;
  newRoleScreen: NewRoleScreenServices;
  editRoleScreen: EditRoleScreenServices;
  duplicateRoleScreen: DuplicateRoleScreenServices;
  accountFooter: AccountFooterServices;
};

const defaultAppServices: AppServices = {
  fetchSession,
  checkSessionStatus,
  signInScreen: defaultSignInScreenServices,
  accountRecoveryScreen: defaultAccountRecoveryScreenServices,
  registerPasskeyScreen: defaultRegisterPasskeyScreenServices,
  myAccountScreen: defaultMyAccountScreenServices,
  usersListScreen: defaultUsersListScreenServices,
  userDetailScreen: defaultUserDetailScreenServices,
  rolesListScreen: defaultRolesListScreenServices,
  newRoleScreen: defaultNewRoleScreenServices,
  editRoleScreen: defaultEditRoleScreenServices,
  duplicateRoleScreen: defaultDuplicateRoleScreenServices,
  accountFooter: defaultAccountFooterServices,
};

export type AppProps = {
  help: BackofficeHelpCatalog;
  /** Injected in tests so App and every screen it renders skip the real APIs and WebAuthn. */
  services?: AppServices;
};

type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out"; notice: SignInOpeningNotice | undefined }
  | {
      kind: "signed-in";
      userId: string;
      displayName: string;
      isAdministrator: boolean;
      permissions: string[];
      expiresAt?: string;
    };

function accessOf(session: Extract<SessionState, { kind: "signed-in" }>): BackofficeAccess {
  return { isAdministrator: session.isAdministrator, permissions: session.permissions };
}

function documentTitle(help: BackofficeHelpCatalog, { categoryId, articleId }: HelpRoute): string {
  const page =
    (articleId ? help.articles[articleId]?.title : undefined) ??
    (categoryId ? help.categories[categoryId]?.label : undefined);
  return page ? messages.help.pageDocumentTitle({ page }) : messages.help.documentTitle;
}

/**
 * Puro Sur's Config area item — the single shared definition of its label, icon and link, so
 * Help's rail and Config's own rail can't drift on it: each only sets which one is active.
 */
function ConfigAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label={messages.settings.areaLabel}
      icon={<Settings />}
      active={active}
      {...linkProps(MY_ACCOUNT_PATH)}
    />
  );
}

/**
 * Puro Sur's Ayuda area item, pinned in the rail footer — the single shared definition of its
 * label, icon and link, so Config's rail and Help's own rail can't drift on it.
 */
function HelpAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label={messages.help.areaLabel}
      icon={<LifeBuoy />}
      active={active}
      {...linkProps("/help")}
    />
  );
}

type HelpAppProps = {
  help: BackofficeHelpCatalog;
  displayName: string;
  onSignedOut: () => void;
  accountFooterServices: AccountFooterServices;
};

/** The Help-in-Shell part of the app, root for every path outside the access screens below. */
function HelpApp({ help, displayName, onSignedOut, accountFooterServices }: HelpAppProps) {
  const route = useRoute();
  const helpRoute = resolveHelpPath(help, route);
  const [search, setSearch] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownPath = useRef(helpRoute.path);
  const title = documentTitle(help, helpRoute);

  useEffect(() => onNavigate(() => setSearch("")), []);

  useEffect(() => {
    if (helpRoute.path !== route) {
      navigate(helpRoute.path, { replace: true });
    }
  }, [helpRoute.path, route]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (shownPath.current !== helpRoute.path) {
      shownPath.current = helpRoute.path;
      headingRef.current?.focus();
    }
  }, [helpRoute.path]);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.help.sectionsNavLabel}
      railAreas={<ConfigAreaItem active={false} />}
      railFooter={
        <>
          <HelpAreaItem active />
          <AccountFooter
            displayName={displayName}
            onSignedOut={onSignedOut}
            services={accountFooterServices}
          />
        </>
      }
      sectionColumn={<HelpSectionColumn help={help} activeCategoryId={helpRoute.categoryId} />}
    >
      <HelpContent
        help={help}
        categoryId={helpRoute.categoryId}
        articleId={helpRoute.articleId}
        search={search}
        onSearchChange={setSearch}
        headingRef={headingRef}
      />
    </Shell>
  );
}

type SettingsAppSection =
  | "myAccount"
  | "usersList"
  | "userDetail"
  | "rolesList"
  | "newRole"
  | "editRole"
  | "duplicateRole";

type SettingsAppProps = {
  section: SettingsAppSection;
  /** Only set for `section: "userDetail"`. */
  userDetailId?: string;
  /** Only set for `section: "editRole"`. */
  editRoleId?: string;
  /** Only set for `section: "duplicateRole"`. */
  duplicateRoleId?: string;
  signedInUserId: string;
  displayName: string;
  canSeeUsers: boolean;
  canSeeRoles: boolean;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  myAccountScreenServices: MyAccountScreenServices;
  usersListScreenServices: UsersListScreenServices;
  userDetailScreenServices: UserDetailScreenServices;
  rolesListScreenServices: RolesListScreenServices;
  newRoleScreenServices: NewRoleScreenServices;
  editRoleScreenServices: EditRoleScreenServices;
  duplicateRoleScreenServices: DuplicateRoleScreenServices;
};

/** The Config-in-Shell part of the app: Usuarios (list, one user's detail, "Mi cuenta") and Roles (list, new/edit/duplicate role). */
function SettingsApp({
  section,
  userDetailId,
  editRoleId,
  duplicateRoleId,
  signedInUserId,
  displayName,
  canSeeUsers,
  canSeeRoles,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  myAccountScreenServices,
  usersListScreenServices,
  userDetailScreenServices,
  rolesListScreenServices,
  newRoleScreenServices,
  editRoleScreenServices,
  duplicateRoleScreenServices,
}: SettingsAppProps) {
  useEffect(() => {
    document.title =
      section === "usersList" || section === "userDetail"
        ? messages.settings.users.documentTitle
        : section === "rolesList" ||
            section === "newRole" ||
            section === "editRole" ||
            section === "duplicateRole"
          ? messages.settings.roles.documentTitle
          : messages.settings.myAccount.documentTitle;
  }, [section]);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.settings.sectionsNavLabel}
      railAreas={<ConfigAreaItem active />}
      railFooter={
        <>
          <HelpAreaItem active={false} />
          <AccountFooter
            displayName={displayName}
            onSignedOut={onSignedOut}
            services={accountFooterServices}
          />
        </>
      }
      sectionColumn={
        <>
          <h2 className="font-bold text-brand-blue-strong text-xl">
            {messages.settings.sectionsHeading}
          </h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeUsers ? (
              <li>
                <SectionNavItem
                  label={messages.settings.usersSectionLabel}
                  icon={<Users />}
                  active={
                    section === "usersList" || section === "userDetail" || section === "myAccount"
                  }
                  {...linkProps(USERS_LIST_PATH)}
                />
              </li>
            ) : (
              // Usuarios isn't unlocked: Mi cuenta gets its own entry instead, so Configuración
              // always has at least one.
              <li>
                <SectionNavItem
                  label={messages.settings.myAccountSectionLabel}
                  icon={<Users />}
                  active={section === "myAccount"}
                  {...linkProps(MY_ACCOUNT_PATH)}
                />
              </li>
            )}
            {canSeeRoles && (
              <li>
                <SectionNavItem
                  label={messages.settings.rolesSectionLabel}
                  icon={<Shield />}
                  active={
                    section === "rolesList" ||
                    section === "newRole" ||
                    section === "editRole" ||
                    section === "duplicateRole"
                  }
                  {...linkProps(ROLES_LIST_PATH)}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      {section === "usersList" && (
        <UsersListScreen onSessionEnded={onSessionEnded} services={usersListScreenServices} />
      )}
      {section === "userDetail" && userDetailId !== undefined && (
        <UserDetailScreen
          userId={userDetailId}
          signedInUserId={signedInUserId}
          onSessionEnded={onSessionEnded}
          services={userDetailScreenServices}
        />
      )}
      {section === "myAccount" && (
        <MyAccountScreen
          displayName={displayName}
          onSessionEnded={onSessionEnded}
          services={myAccountScreenServices}
        />
      )}
      {section === "rolesList" && (
        <RolesListScreen onSessionEnded={onSessionEnded} services={rolesListScreenServices} />
      )}
      {section === "newRole" && (
        <NewRoleScreen onSessionEnded={onSessionEnded} services={newRoleScreenServices} />
      )}
      {section === "editRole" && editRoleId !== undefined && (
        <EditRoleScreen
          roleId={editRoleId}
          onSessionEnded={onSessionEnded}
          services={editRoleScreenServices}
        />
      )}
      {section === "duplicateRole" && duplicateRoleId !== undefined && (
        <DuplicateRoleScreen
          roleId={duplicateRoleId}
          onSessionEnded={onSessionEnded}
          services={duplicateRoleScreenServices}
        />
      )}
    </Shell>
  );
}

export function App({ help, services }: AppProps) {
  const {
    fetchSession,
    checkSessionStatus,
    signInScreen,
    accountRecoveryScreen,
    registerPasskeyScreen,
    myAccountScreen,
    usersListScreen,
    userDetailScreen,
    rolesListScreen,
    newRoleScreen,
    editRoleScreen,
    duplicateRoleScreen,
    accountFooter,
  } = services ?? defaultAppServices;
  const route = useRoute();
  const [session, setSession] = useState<SessionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchSession().then((outcome) => {
      if (cancelled) {
        return;
      }
      if (outcome.kind === "ok") {
        markSignedIn();
        setSession({
          kind: "signed-in",
          userId: outcome.userId,
          displayName: outcome.displayName,
          isAdministrator: outcome.isAdministrator,
          permissions: outcome.permissions ?? [],
          ...(outcome.expiresAt !== undefined ? { expiresAt: outcome.expiresAt } : {}),
        });
        return;
      }
      if (outcome.kind === "rate_limited") {
        // Same reasoning as "failed" below: nobody said the session ended, so the marker stays.
        setSession({
          kind: "signed-out",
          notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
        });
        return;
      }
      if (outcome.kind === "failed") {
        // Nobody said the session ended — the question never got an answer. Clearing the marker
        // here would turn the next attempt's honest "venció" into a lie, and the session itself
        // may well still be live.
        setSession({ kind: "signed-out", notice: { kind: "check_failed" } });
        return;
      }
      const expired = wasSignedIn();
      clearSignedInMarker();
      setSession({ kind: "signed-out", notice: expired ? { kind: "expired" } : undefined });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSession]);

  const isAccessRoute =
    route === SIGN_IN_PATH || route === ACCOUNT_RECOVERY_PATH || route === REGISTER_PASSKEY_PATH;

  const userDetailId = matchUserDetailPath(route);
  const editRoleId = matchRoleEditPath(route);
  const duplicateRoleId = matchRoleDuplicatePath(route);
  const isSettingsRoute =
    route === MY_ACCOUNT_PATH ||
    route === USERS_LIST_PATH ||
    userDetailId !== undefined ||
    route === ROLES_LIST_PATH ||
    route === NEW_ROLE_PATH ||
    editRoleId !== undefined ||
    duplicateRoleId !== undefined;
  // "Usuarios" and "Roles" are only reachable through their own URLs; Mi cuenta (self-service)
  // never depends on either.
  const wantsUsers = route === USERS_LIST_PATH || userDetailId !== undefined;
  const wantsRoles =
    route === ROLES_LIST_PATH ||
    route === NEW_ROLE_PATH ||
    editRoleId !== undefined ||
    duplicateRoleId !== undefined;
  const access: BackofficeAccess =
    session.kind === "signed-in" ? accessOf(session) : { isAdministrator: false, permissions: [] };
  const canSeeUsers = canSeeUsersArea(access);
  const canSeeRoles = canSeeRolesArea(access);
  const wantsUnlockedSection = (wantsUsers && !canSeeUsers) || (wantsRoles && !canSeeRoles);

  useEffect(() => {
    if (session.kind === "loading") {
      return;
    }
    if (session.kind === "signed-in" && route === SIGN_IN_PATH) {
      navigate("/", { replace: true });
    } else if (session.kind !== "signed-in" && !isAccessRoute) {
      navigate(SIGN_IN_PATH, { replace: true });
    } else if (session.kind === "signed-in" && wantsUnlockedSection) {
      // A typed, stale, or now-forbidden settings URL (e.g. the role changed mid-session) never
      // shows a forbidden notice: it lands on Mi cuenta instead, the one screen everyone keeps.
      navigate(MY_ACCOUNT_PATH, { replace: true });
    }
  }, [session.kind, route, isAccessRoute, wantsUnlockedSection]);

  function handleSignedIn() {
    setSession({ kind: "loading" });
    void fetchSession().then((outcome) => {
      if (outcome.kind === "ok") {
        markSignedIn();
        setSession({
          kind: "signed-in",
          userId: outcome.userId,
          displayName: outcome.displayName,
          isAdministrator: outcome.isAdministrator,
          permissions: outcome.permissions ?? [],
          ...(outcome.expiresAt !== undefined ? { expiresAt: outcome.expiresAt } : {}),
        });
        return;
      }
      if (outcome.kind === "rate_limited") {
        setSession({
          kind: "signed-out",
          notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
        });
        return;
      }
      setSession({
        kind: "signed-out",
        notice: outcome.kind === "failed" ? { kind: "check_failed" } : undefined,
      });
    });
  }

  function handleSignedOut() {
    clearSignedInMarker();
    setSession({ kind: "signed-out", notice: undefined });
    navigate(SIGN_IN_PATH, { replace: true });
  }

  // A signed-in screen's own API call can find the session already ended (idle/absolute expiry,
  // or signed out from elsewhere) after the mount check above already found it open: same outcome
  // as that check finding none, so it gets the same expired notice.
  function handleSessionEnded() {
    clearSignedInMarker();
    setSession({ kind: "signed-out", notice: { kind: "expired" } });
    navigate(SIGN_IN_PATH, { replace: true });
  }

  // Notices the session ending without a reload — idle/absolute expiry, revocation, deactivation
  // — while this tab stays open and nobody's own screen happens to make a call that would catch it.
  useSessionWatcher({
    active: session.kind === "signed-in",
    checkStatus: checkSessionStatus,
    onEnded: handleSessionEnded,
    ...(session.kind === "signed-in" && session.expiresAt !== undefined
      ? { initialExpiresAt: session.expiresAt }
      : {}),
  });

  // Keeps a continuously worked tab from going idle: real use (not merely an open tab) touches
  // the session, and the watcher above follows the fresher deadline that comes back.
  useSessionActivityReporter({
    active: session.kind === "signed-in",
    touchSession: fetchSession,
    onTouched: (expiresAt) => {
      setSession((current) => (current.kind === "signed-in" ? { ...current, expiresAt } : current));
    },
    onEnded: handleSessionEnded,
  });

  if (session.kind === "loading") {
    return null;
  }

  if (isSettingsRoute) {
    if (session.kind !== "signed-in") {
      return null;
    }
    if (wantsUnlockedSection) {
      // The effect above is already redirecting to Mi cuenta: never render the section itself,
      // not even for one frame.
      return null;
    }
    return (
      <SettingsApp
        section={
          route === USERS_LIST_PATH
            ? "usersList"
            : userDetailId !== undefined
              ? "userDetail"
              : route === ROLES_LIST_PATH
                ? "rolesList"
                : route === NEW_ROLE_PATH
                  ? "newRole"
                  : editRoleId !== undefined
                    ? "editRole"
                    : duplicateRoleId !== undefined
                      ? "duplicateRole"
                      : "myAccount"
        }
        {...(userDetailId !== undefined ? { userDetailId } : {})}
        {...(editRoleId !== undefined ? { editRoleId } : {})}
        {...(duplicateRoleId !== undefined ? { duplicateRoleId } : {})}
        signedInUserId={session.userId}
        displayName={session.displayName}
        canSeeUsers={canSeeUsers}
        canSeeRoles={canSeeRoles}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        myAccountScreenServices={myAccountScreen}
        usersListScreenServices={usersListScreen}
        userDetailScreenServices={userDetailScreen}
        rolesListScreenServices={rolesListScreen}
        newRoleScreenServices={newRoleScreen}
        editRoleScreenServices={editRoleScreen}
        duplicateRoleScreenServices={duplicateRoleScreen}
      />
    );
  }

  switch (route) {
    case SIGN_IN_PATH:
      return session.kind === "signed-in" ? null : (
        <SignInScreen
          openingNotice={session.notice}
          onSignedIn={handleSignedIn}
          services={signInScreen}
        />
      );
    case ACCOUNT_RECOVERY_PATH:
      return <AccountRecoveryScreen services={accountRecoveryScreen} />;
    case REGISTER_PASSKEY_PATH:
      return <RegisterPasskeyScreen services={registerPasskeyScreen} />;
    default:
      return session.kind === "signed-in" ? (
        <HelpApp
          help={help}
          displayName={session.displayName}
          onSignedOut={handleSignedOut}
          accountFooterServices={accountFooter}
        />
      ) : null;
  }
}
