import { AreaNavItem, SectionNavItem } from "@purosur/ui";
import {
  Laptop,
  LifeBuoy,
  Package,
  Settings,
  Shield,
  SlidersHorizontal,
  Store,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
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
import {
  type BackofficeAccess,
  canSeeBranchArea,
  canSeeCashArea,
  canSeeCatalogArea,
  canSeeRegistersArea,
  canSeeRolesArea,
  canSeeUsersArea,
} from "./access";
import { ACCOUNT_RECOVERY_PATH, REGISTER_PASSKEY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import {
  BranchSettingsScreen,
  type BranchSettingsScreenServices,
  defaultBranchSettingsScreenServices,
} from "./BranchSettingsScreen";
import {
  CategoriesListScreen,
  type CategoriesListScreenServices,
  defaultCategoriesListScreenServices,
} from "./CategoriesListScreen";
import { FISCAL_CONFIGURATION_PATH } from "./cashRoutes";
import { CATEGORIES_LIST_PATH, PRODUCTS_LIST_PATH } from "./catalogRoutes";
import {
  defaultFiscalConfigurationScreenServices,
  FiscalConfigurationScreen,
  type FiscalConfigurationScreenServices,
} from "./FiscalConfigurationScreen";
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
  defaultProductsListScreenServices,
  ProductsListScreen,
  type ProductsListScreenServices,
} from "./ProductsListScreen";
import {
  defaultRegisterPasskeyScreenServices,
  RegisterPasskeyScreen,
  type RegisterPasskeyScreenServices,
} from "./RegisterPasskeyScreen";
import {
  defaultRegistersListScreenServices,
  RegistersListScreen,
  type RegistersListScreenServices,
} from "./RegistersListScreen";
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
  BRANCH_SETTINGS_PATH,
  MY_ACCOUNT_PATH,
  matchUserDetailPath,
  REGISTERS_LIST_PATH,
  ROLES_LIST_PATH,
  sendToMyAccount,
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
  registersListScreen: RegistersListScreenServices;
  branchSettingsScreen: BranchSettingsScreenServices;
  categoriesListScreen: CategoriesListScreenServices;
  productsListScreen: ProductsListScreenServices;
  fiscalConfigurationScreen: FiscalConfigurationScreenServices;
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
  registersListScreen: defaultRegistersListScreenServices,
  branchSettingsScreen: defaultBranchSettingsScreenServices,
  categoriesListScreen: defaultCategoriesListScreenServices,
  productsListScreen: defaultProductsListScreenServices,
  fiscalConfigurationScreen: defaultFiscalConfigurationScreenServices,
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

/**
 * Puro Sur's Catálogo area item — the single shared definition of its label, icon and link.
 * Unlike Config and Ayuda, it only shows for someone who unlocks it: the caller decides whether
 * to render it at all.
 */
function CatalogAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label={messages.catalog.areaLabel}
      icon={<Package />}
      active={active}
      {...linkProps(PRODUCTS_LIST_PATH)}
    />
  );
}

/**
 * Puro Sur's Caja area item — the single shared definition of its label, icon and link. Like
 * Catálogo, it only shows for someone who unlocks it, and the design lists it right after Catálogo
 * (the areas between them, Stock and Pedidos, don't exist in the backoffice yet).
 */
function CashAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label={messages.cash.areaLabel}
      icon={<Wallet />}
      active={active}
      {...linkProps(FISCAL_CONFIGURATION_PATH)}
    />
  );
}

type HelpAppProps = {
  help: BackofficeHelpCatalog;
  displayName: string;
  canSeeCatalog: boolean;
  canSeeCash: boolean;
  onSignedOut: () => void;
  accountFooterServices: AccountFooterServices;
};

/** The Help-in-Shell part of the app, root for every path outside the access screens below. */
function HelpApp({
  help,
  displayName,
  canSeeCatalog,
  canSeeCash,
  onSignedOut,
  accountFooterServices,
}: HelpAppProps) {
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
      railAreas={
        <>
          {canSeeCatalog && <CatalogAreaItem active={false} />}
          {canSeeCash && <CashAreaItem active={false} />}
          <ConfigAreaItem active={false} />
        </>
      }
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
      {/* Keyed by path so every help page mounts its own scroll body, opening at the top instead of
          at the offset the previous page was scrolled to. */}
      <HelpContent
        key={helpRoute.path}
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
  | "registersList"
  | "branchSettings";

type SettingsAppProps = {
  section: SettingsAppSection;
  /** Only set for `section: "userDetail"`. */
  userDetailId?: string;
  signedInUserId: string;
  displayName: string;
  access: BackofficeAccess;
  canSeeUsers: boolean;
  canSeeRoles: boolean;
  canSeeRegisters: boolean;
  canSeeBranch: boolean;
  canSeeCatalog: boolean;
  canSeeCash: boolean;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  myAccountScreenServices: MyAccountScreenServices;
  usersListScreenServices: UsersListScreenServices;
  userDetailScreenServices: UserDetailScreenServices;
  rolesListScreenServices: RolesListScreenServices;
  registersListScreenServices: RegistersListScreenServices;
  branchSettingsScreenServices: BranchSettingsScreenServices;
};

/**
 * The Config-in-Shell part of the app: Usuarios (list, one user's detail, "Mi cuenta"), Roles
 * (list, with the new/edit/duplicate editor as a modal over it), and Sucursal (the branch's own
 * settings).
 */
function SettingsApp({
  section,
  userDetailId,
  signedInUserId,
  displayName,
  access,
  canSeeUsers,
  canSeeRoles,
  canSeeRegisters,
  canSeeBranch,
  canSeeCatalog,
  canSeeCash,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  myAccountScreenServices,
  usersListScreenServices,
  userDetailScreenServices,
  rolesListScreenServices,
  registersListScreenServices,
  branchSettingsScreenServices,
}: SettingsAppProps) {
  useEffect(() => {
    document.title =
      section === "usersList" || section === "userDetail"
        ? messages.settings.users.documentTitle
        : section === "rolesList"
          ? messages.settings.roles.documentTitle
          : section === "registersList"
            ? messages.settings.registers.documentTitle
            : section === "branchSettings"
              ? messages.settings.branch.documentTitle
              : messages.settings.myAccount.documentTitle;
  }, [section]);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.settings.sectionsNavLabel}
      railAreas={
        <>
          {canSeeCatalog && <CatalogAreaItem active={false} />}
          {canSeeCash && <CashAreaItem active={false} />}
          <ConfigAreaItem active />
        </>
      }
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
                  active={section === "rolesList"}
                  {...linkProps(ROLES_LIST_PATH)}
                />
              </li>
            )}
            {canSeeRegisters && (
              <li>
                <SectionNavItem
                  label={messages.settings.registersSectionLabel}
                  icon={<Laptop />}
                  active={section === "registersList"}
                  {...linkProps(REGISTERS_LIST_PATH)}
                />
              </li>
            )}
            {canSeeBranch && (
              <li>
                <SectionNavItem
                  label={messages.settings.branchSectionLabel}
                  icon={<Store />}
                  active={section === "branchSettings"}
                  {...linkProps(BRANCH_SETTINGS_PATH)}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      {section === "usersList" && (
        <UsersListScreen
          access={access}
          onSessionEnded={onSessionEnded}
          services={usersListScreenServices}
        />
      )}
      {section === "userDetail" && userDetailId !== undefined && (
        <UserDetailScreen
          userId={userDetailId}
          signedInUserId={signedInUserId}
          access={access}
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
      {section === "registersList" && (
        <RegistersListScreen
          onSessionEnded={onSessionEnded}
          services={registersListScreenServices}
        />
      )}
      {section === "branchSettings" && (
        <BranchSettingsScreen
          onSessionEnded={onSessionEnded}
          services={branchSettingsScreenServices}
        />
      )}
    </Shell>
  );
}

type CatalogAppProps = {
  displayName: string;
  canSeeCash: boolean;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  categoriesListScreenServices: CategoriesListScreenServices;
  productsListScreenServices: ProductsListScreenServices;
};

/**
 * The Catálogo-in-Shell part of the app: Productos (its own landing) and Categorías. App.tsx only
 * ever routes here for someone who unlocks the area, so `CatalogAreaItem` always renders active;
 * which of its two sections does depends on the current route.
 */
function CatalogApp({
  displayName,
  canSeeCash,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  categoriesListScreenServices,
  productsListScreenServices,
}: CatalogAppProps) {
  const route = useRoute();
  const isCategoriesRoute = route === CATEGORIES_LIST_PATH;

  useEffect(() => {
    document.title = isCategoriesRoute
      ? messages.catalog.categories.documentTitle
      : messages.catalog.products.documentTitle;
  }, [isCategoriesRoute]);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.catalog.sectionsNavLabel}
      railAreas={
        <>
          <CatalogAreaItem active />
          {canSeeCash && <CashAreaItem active={false} />}
          <ConfigAreaItem active={false} />
        </>
      }
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
            {messages.catalog.sectionsHeading}
          </h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            <li>
              <SectionNavItem
                label={messages.catalog.productsSectionLabel}
                icon={<Package />}
                active={!isCategoriesRoute}
                {...linkProps(PRODUCTS_LIST_PATH)}
              />
            </li>
            <li>
              <SectionNavItem
                label={messages.catalog.categoriesSectionLabel}
                icon={<Tags />}
                active={isCategoriesRoute}
                {...linkProps(CATEGORIES_LIST_PATH)}
              />
            </li>
          </ul>
        </>
      }
    >
      {isCategoriesRoute ? (
        <CategoriesListScreen
          onSessionEnded={onSessionEnded}
          services={categoriesListScreenServices}
        />
      ) : (
        <ProductsListScreen onSessionEnded={onSessionEnded} services={productsListScreenServices} />
      )}
    </Shell>
  );
}

type CashAppProps = {
  displayName: string;
  canSeeCatalog: boolean;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  fiscalConfigurationScreenServices: FiscalConfigurationScreenServices;
};

/**
 * The Caja-in-Shell part of the app: "Caja y fiscal", today holding only Configuración fiscal
 * (its own landing). App.tsx only ever routes here for someone who unlocks the area, so
 * `CashAreaItem` and "Configuración fiscal" always render active. The design also draws a CAJA
 * and a TAREAS group above FISCAL, but neither has a section built yet, so only FISCAL's own
 * group label and its one section show.
 */
function CashApp({
  displayName,
  canSeeCatalog,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  fiscalConfigurationScreenServices,
}: CashAppProps) {
  useEffect(() => {
    document.title = messages.cash.fiscalConfiguration.documentTitle;
  }, []);

  return (
    <Shell
      brandName={messages.shell.brandName}
      areaRailLabel={messages.shell.areaRailLabel}
      sectionColumnLabel={messages.cash.sectionsNavLabel}
      railAreas={
        <>
          {canSeeCatalog && <CatalogAreaItem active={false} />}
          <CashAreaItem active />
          <ConfigAreaItem active={false} />
        </>
      }
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
            {messages.cash.sectionsHeading}
          </h2>
          <div className="h-2.5" />
          <p className="px-3 pt-3 pb-1 font-bold text-ink-secondary text-xs tracking-[1px]">
            {messages.cash.fiscalGroupLabel}
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <SectionNavItem
                label={messages.cash.fiscalConfigurationSectionLabel}
                icon={<SlidersHorizontal />}
                active
                {...linkProps(FISCAL_CONFIGURATION_PATH)}
              />
            </li>
          </ul>
        </>
      }
    >
      <FiscalConfigurationScreen
        onSessionEnded={onSessionEnded}
        services={fiscalConfigurationScreenServices}
      />
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
    registersListScreen,
    branchSettingsScreen,
    categoriesListScreen,
    productsListScreen,
    fiscalConfigurationScreen,
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
  const isSettingsRoute =
    route === MY_ACCOUNT_PATH ||
    route === USERS_LIST_PATH ||
    userDetailId !== undefined ||
    route === ROLES_LIST_PATH ||
    route === REGISTERS_LIST_PATH ||
    route === BRANCH_SETTINGS_PATH;
  // "Usuarios", "Roles", "Cajas registradoras" and "Sucursal" are only reachable through their own
  // URLs; Mi cuenta (self-service) never depends on any of them.
  const wantsUsers = route === USERS_LIST_PATH || userDetailId !== undefined;
  const wantsRoles = route === ROLES_LIST_PATH;
  const wantsRegisters = route === REGISTERS_LIST_PATH;
  const wantsBranch = route === BRANCH_SETTINGS_PATH;
  const isCatalogRoute = route === CATEGORIES_LIST_PATH || route === PRODUCTS_LIST_PATH;
  const wantsCatalog = isCatalogRoute;
  const isCashRoute = route === FISCAL_CONFIGURATION_PATH;
  const wantsCash = isCashRoute;
  const access: BackofficeAccess =
    session.kind === "signed-in" ? accessOf(session) : { isAdministrator: false, permissions: [] };
  const canSeeUsers = canSeeUsersArea(access);
  const canSeeRoles = canSeeRolesArea(access);
  const canSeeRegisters = canSeeRegistersArea(access);
  const canSeeBranch = canSeeBranchArea(access);
  const canSeeCatalog = canSeeCatalogArea(access);
  const canSeeCash = canSeeCashArea(access);
  const wantsUnlockedSection =
    (wantsUsers && !canSeeUsers) ||
    (wantsRoles && !canSeeRoles) ||
    (wantsRegisters && !canSeeRegisters) ||
    (wantsBranch && !canSeeBranch) ||
    (wantsCatalog && !canSeeCatalog) ||
    (wantsCash && !canSeeCash);

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
      sendToMyAccount();
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
  // the session, the watcher above follows the fresher deadline that comes back, and the rail and
  // route gating follow the role's current access.
  useSessionActivityReporter({
    active: session.kind === "signed-in",
    touchSession: fetchSession,
    onTouched: (touched) => {
      setSession((current) =>
        current.kind === "signed-in"
          ? {
              ...current,
              isAdministrator: touched.isAdministrator,
              permissions: touched.permissions ?? [],
              ...(touched.expiresAt !== undefined ? { expiresAt: touched.expiresAt } : {}),
            }
          : current,
      );
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
                : route === REGISTERS_LIST_PATH
                  ? "registersList"
                  : route === BRANCH_SETTINGS_PATH
                    ? "branchSettings"
                    : "myAccount"
        }
        {...(userDetailId !== undefined ? { userDetailId } : {})}
        signedInUserId={session.userId}
        displayName={session.displayName}
        access={access}
        canSeeUsers={canSeeUsers}
        canSeeRoles={canSeeRoles}
        canSeeRegisters={canSeeRegisters}
        canSeeBranch={canSeeBranch}
        canSeeCatalog={canSeeCatalog}
        canSeeCash={canSeeCash}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        myAccountScreenServices={myAccountScreen}
        usersListScreenServices={usersListScreen}
        userDetailScreenServices={userDetailScreen}
        rolesListScreenServices={rolesListScreen}
        registersListScreenServices={registersListScreen}
        branchSettingsScreenServices={branchSettingsScreen}
      />
    );
  }

  if (isCatalogRoute) {
    if (session.kind !== "signed-in") {
      return null;
    }
    if (wantsUnlockedSection) {
      // The effect above is already redirecting to Mi cuenta: never render the section itself,
      // not even for one frame.
      return null;
    }
    return (
      <CatalogApp
        displayName={session.displayName}
        canSeeCash={canSeeCash}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        categoriesListScreenServices={categoriesListScreen}
        productsListScreenServices={productsListScreen}
      />
    );
  }

  if (isCashRoute) {
    if (session.kind !== "signed-in") {
      return null;
    }
    if (wantsUnlockedSection) {
      // The effect above is already redirecting to Mi cuenta: never render the section itself,
      // not even for one frame.
      return null;
    }
    return (
      <CashApp
        displayName={session.displayName}
        canSeeCatalog={canSeeCatalog}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        fiscalConfigurationScreenServices={fiscalConfigurationScreen}
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
          canSeeCatalog={canSeeCatalog}
          canSeeCash={canSeeCash}
          onSignedOut={handleSignedOut}
          accountFooterServices={accountFooter}
        />
      ) : null;
  }
}
