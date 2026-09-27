import { AreaNavItem, FieldSizeProvider, SectionNavItem } from "@purosur/ui";
import {
  Bell,
  Home,
  Laptop,
  LifeBuoy,
  ListChecks,
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
  AlertsListScreen,
  type AlertsListScreenServices,
  defaultAlertsListScreenServices,
} from "./AlertsListScreen";
import {
  type BackofficeAccess,
  canManageProductsAndCategories,
  canSeeAlertsArea,
  canSeeBranchArea,
  canSeeCashArea,
  canSeeCatalogArea,
  canSeePricesArea,
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
import { CATEGORIES_LIST_PATH, PRICES_LIST_PATH, PRODUCTS_LIST_PATH } from "./catalogRoutes";
import {
  defaultFiscalConfigurationScreenServices,
  FiscalConfigurationScreen,
  type FiscalConfigurationScreenServices,
} from "./FiscalConfigurationScreen";
import { HelpContent, HelpSectionColumn } from "./HelpScreen";
import { type BackofficeHelpCatalog, type HelpRoute, resolveHelpPath } from "./helpRoutes";
import { ALERTS_LIST_PATH } from "./inicioRoutes";
import { linkProps } from "./linkProps";
import {
  defaultMyAccountScreenServices,
  MyAccountScreen,
  type MyAccountScreenServices,
} from "./MyAccountScreen";
import {
  defaultPricesListScreenServices,
  PricesListScreen,
  type PricesListScreenServices,
} from "./PricesListScreen";
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
  pricesListScreen: PricesListScreenServices;
  fiscalConfigurationScreen: FiscalConfigurationScreenServices;
  accountFooter: AccountFooterServices;
  alertsListScreen: AlertsListScreenServices;
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
  pricesListScreen: defaultPricesListScreenServices,
  fiscalConfigurationScreen: defaultFiscalConfigurationScreenServices,
  accountFooter: defaultAccountFooterServices,
  alertsListScreen: defaultAlertsListScreenServices,
};

export type AppProps = {
  help: BackofficeHelpCatalog;
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
  return page ? `${page} · Ayuda · Puro Sur` : "Ayuda · Puro Sur";
}

function ConfigAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label="Config"
      icon={<Settings />}
      active={active}
      {...linkProps(MY_ACCOUNT_PATH)}
    />
  );
}

function HelpAreaItem({ active }: { active: boolean }) {
  return <AreaNavItem label="Ayuda" icon={<LifeBuoy />} active={active} {...linkProps("/help")} />;
}

function InicioAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem label="Inicio" icon={<Home />} active={active} {...linkProps(ALERTS_LIST_PATH)} />
  );
}

function CatalogAreaItem({ active, defaultPath }: { active: boolean; defaultPath: string }) {
  return (
    <AreaNavItem label="Catálogo" icon={<Package />} active={active} {...linkProps(defaultPath)} />
  );
}

function CashAreaItem({ active }: { active: boolean }) {
  return (
    <AreaNavItem
      label="Caja"
      icon={<Wallet />}
      active={active}
      {...linkProps(FISCAL_CONFIGURATION_PATH)}
    />
  );
}

type HelpAppProps = {
  help: BackofficeHelpCatalog;
  displayName: string;
  canSeeAlerts: boolean;
  canSeeCatalog: boolean;
  catalogDefaultPath: string;
  canSeeCash: boolean;
  onSignedOut: () => void;
  accountFooterServices: AccountFooterServices;
};

function HelpApp({
  help,
  displayName,
  canSeeAlerts,
  canSeeCatalog,
  catalogDefaultPath,
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
      areaRailLabel="Áreas"
      sectionColumnLabel="Secciones de ayuda"
      railAreas={
        <>
          {canSeeAlerts && <InicioAreaItem active={false} />}
          {canSeeCatalog && <CatalogAreaItem active={false} defaultPath={catalogDefaultPath} />}
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
  userDetailId?: string;
  signedInUserId: string;
  displayName: string;
  access: BackofficeAccess;
  canSeeUsers: boolean;
  canSeeRoles: boolean;
  canSeeRegisters: boolean;
  canSeeBranch: boolean;
  canSeeAlerts: boolean;
  canSeeCatalog: boolean;
  catalogDefaultPath: string;
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
  canSeeAlerts,
  canSeeCatalog,
  catalogDefaultPath,
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
        ? "Usuarios · Puro Sur"
        : section === "rolesList"
          ? "Roles · Puro Sur"
          : section === "registersList"
            ? "Cajas registradoras · Puro Sur"
            : section === "branchSettings"
              ? "Sucursal · Puro Sur"
              : "Mi cuenta · Puro Sur";
  }, [section]);

  return (
    <Shell
      areaRailLabel="Áreas"
      sectionColumnLabel="Configuración"
      railAreas={
        <>
          {canSeeAlerts && <InicioAreaItem active={false} />}
          {canSeeCatalog && <CatalogAreaItem active={false} defaultPath={catalogDefaultPath} />}
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
          <h2 className="font-bold text-brand-blue-strong text-xl">Configuración</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeUsers ? (
              <li>
                <SectionNavItem
                  label="Usuarios"
                  icon={<Users />}
                  active={
                    section === "usersList" || section === "userDetail" || section === "myAccount"
                  }
                  {...linkProps(USERS_LIST_PATH)}
                />
              </li>
            ) : (
              <li>
                <SectionNavItem
                  label="Mi cuenta"
                  icon={<Users />}
                  active={section === "myAccount"}
                  {...linkProps(MY_ACCOUNT_PATH)}
                />
              </li>
            )}
            {canSeeRoles && (
              <li>
                <SectionNavItem
                  label="Roles"
                  icon={<Shield />}
                  active={section === "rolesList"}
                  {...linkProps(ROLES_LIST_PATH)}
                />
              </li>
            )}
            {canSeeRegisters && (
              <li>
                <SectionNavItem
                  label="Cajas registradoras"
                  icon={<Laptop />}
                  active={section === "registersList"}
                  {...linkProps(REGISTERS_LIST_PATH)}
                />
              </li>
            )}
            {canSeeBranch && (
              <li>
                <SectionNavItem
                  label="Sucursal"
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
  canSeeAlerts: boolean;
  canManageCatalogProducts: boolean;
  canSeePrices: boolean;
  catalogDefaultPath: string;
  canSeeCash: boolean;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  categoriesListScreenServices: CategoriesListScreenServices;
  productsListScreenServices: ProductsListScreenServices;
  pricesListScreenServices: PricesListScreenServices;
};

function CatalogApp({
  displayName,
  canSeeAlerts,
  canManageCatalogProducts,
  canSeePrices,
  catalogDefaultPath,
  canSeeCash,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  categoriesListScreenServices,
  productsListScreenServices,
  pricesListScreenServices,
}: CatalogAppProps) {
  const route = useRoute();
  const isCategoriesRoute = route === CATEGORIES_LIST_PATH;
  const isPricesRoute = route === PRICES_LIST_PATH;
  const isProductsRoute = !isCategoriesRoute && !isPricesRoute;

  useEffect(() => {
    document.title = isCategoriesRoute
      ? "Categorías · Puro Sur"
      : isPricesRoute
        ? "Precios · Puro Sur"
        : "Productos · Puro Sur";
  }, [isCategoriesRoute, isPricesRoute]);

  return (
    <Shell
      areaRailLabel="Áreas"
      sectionColumnLabel="Catálogo"
      railAreas={
        <>
          {canSeeAlerts && <InicioAreaItem active={false} />}
          <CatalogAreaItem active defaultPath={catalogDefaultPath} />
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
          <h2 className="font-bold text-brand-blue-strong text-xl">Catálogo</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canManageCatalogProducts && (
              <>
                <li>
                  <SectionNavItem
                    label="Productos"
                    icon={<Package />}
                    active={isProductsRoute}
                    {...linkProps(PRODUCTS_LIST_PATH)}
                  />
                </li>
                <li>
                  <SectionNavItem
                    label="Categorías"
                    icon={<Tags />}
                    active={isCategoriesRoute}
                    {...linkProps(CATEGORIES_LIST_PATH)}
                  />
                </li>
              </>
            )}
            {canSeePrices && (
              <li>
                <SectionNavItem
                  label="Precios"
                  icon={<ListChecks />}
                  active={isPricesRoute}
                  {...linkProps(PRICES_LIST_PATH)}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      {isCategoriesRoute ? (
        <CategoriesListScreen
          onSessionEnded={onSessionEnded}
          services={categoriesListScreenServices}
        />
      ) : isPricesRoute ? (
        <PricesListScreen onSessionEnded={onSessionEnded} services={pricesListScreenServices} />
      ) : (
        <ProductsListScreen onSessionEnded={onSessionEnded} services={productsListScreenServices} />
      )}
    </Shell>
  );
}

type CashAppProps = {
  displayName: string;
  canSeeAlerts: boolean;
  canSeeCatalog: boolean;
  catalogDefaultPath: string;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  fiscalConfigurationScreenServices: FiscalConfigurationScreenServices;
};

function CashApp({
  displayName,
  canSeeAlerts,
  canSeeCatalog,
  catalogDefaultPath,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  fiscalConfigurationScreenServices,
}: CashAppProps) {
  useEffect(() => {
    document.title = "Configuración fiscal · Puro Sur";
  }, []);

  return (
    <Shell
      areaRailLabel="Áreas"
      sectionColumnLabel="Caja y fiscal"
      railAreas={
        <>
          {canSeeAlerts && <InicioAreaItem active={false} />}
          {canSeeCatalog && <CatalogAreaItem active={false} defaultPath={catalogDefaultPath} />}
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
          <h2 className="font-bold text-brand-blue-strong text-xl">Caja y fiscal</h2>
          <div className="h-2.5" />
          <p className="px-3 pt-3 pb-1 font-bold text-ink-secondary text-xs tracking-[1px]">
            FISCAL
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <SectionNavItem
                label="Configuración fiscal"
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

type InicioAppProps = {
  access: BackofficeAccess;
  displayName: string;
  canSeeCatalog: boolean;
  catalogDefaultPath: string;
  canSeeCash: boolean;
  onSignedOut: () => void;
  onSessionEnded: () => void;
  accountFooterServices: AccountFooterServices;
  alertsListScreenServices: AlertsListScreenServices;
};

function InicioApp({
  access,
  displayName,
  canSeeCatalog,
  catalogDefaultPath,
  canSeeCash,
  onSignedOut,
  onSessionEnded,
  accountFooterServices,
  alertsListScreenServices,
}: InicioAppProps) {
  useEffect(() => {
    document.title = "Alertas · Puro Sur";
  }, []);

  return (
    <Shell
      areaRailLabel="Áreas"
      sectionColumnLabel="Inicio"
      railAreas={
        <>
          <InicioAreaItem active />
          {canSeeCatalog && <CatalogAreaItem active={false} defaultPath={catalogDefaultPath} />}
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
          <h2 className="font-bold text-brand-blue-strong text-xl">Inicio</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            <li>
              <SectionNavItem
                label="Alertas"
                icon={<Bell />}
                active
                {...linkProps(ALERTS_LIST_PATH)}
              />
            </li>
          </ul>
        </>
      }
    >
      <AlertsListScreen
        access={access}
        onSessionEnded={onSessionEnded}
        services={alertsListScreenServices}
      />
    </Shell>
  );
}

export function App(props: AppProps) {
  return (
    <FieldSizeProvider size="backoffice">
      <AppContent {...props} />
    </FieldSizeProvider>
  );
}

function AppContent({ help, services }: AppProps) {
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
    pricesListScreen,
    fiscalConfigurationScreen,
    accountFooter,
    alertsListScreen,
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
        setSession({
          kind: "signed-out",
          notice: { kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds },
        });
        return;
      }
      if (outcome.kind === "failed") {
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
  const wantsUsers = route === USERS_LIST_PATH || userDetailId !== undefined;
  const wantsRoles = route === ROLES_LIST_PATH;
  const wantsRegisters = route === REGISTERS_LIST_PATH;
  const wantsBranch = route === BRANCH_SETTINGS_PATH;
  const wantsProductsOrCategories = route === CATEGORIES_LIST_PATH || route === PRODUCTS_LIST_PATH;
  const wantsPrices = route === PRICES_LIST_PATH;
  const isCatalogRoute = wantsProductsOrCategories || wantsPrices;
  const isCashRoute = route === FISCAL_CONFIGURATION_PATH;
  const wantsCash = isCashRoute;
  const isInicioRoute = route === ALERTS_LIST_PATH;
  const wantsInicio = isInicioRoute;
  const access: BackofficeAccess =
    session.kind === "signed-in" ? accessOf(session) : { isAdministrator: false, permissions: [] };
  const canSeeUsers = canSeeUsersArea(access);
  const canSeeRoles = canSeeRolesArea(access);
  const canSeeRegisters = canSeeRegistersArea(access);
  const canSeeBranch = canSeeBranchArea(access);
  const canManageCatalogProducts = canManageProductsAndCategories(access);
  const canSeePrices = canSeePricesArea(access);
  const canSeeCatalog = canSeeCatalogArea(access);
  const catalogDefaultPath = canManageCatalogProducts ? PRODUCTS_LIST_PATH : PRICES_LIST_PATH;
  const canSeeCash = canSeeCashArea(access);
  const canSeeAlerts = canSeeAlertsArea(access);
  const wantsUnlockedSection =
    (wantsUsers && !canSeeUsers) ||
    (wantsRoles && !canSeeRoles) ||
    (wantsRegisters && !canSeeRegisters) ||
    (wantsBranch && !canSeeBranch) ||
    (wantsProductsOrCategories && !canManageCatalogProducts) ||
    (wantsPrices && !canSeePrices) ||
    (wantsCash && !canSeeCash) ||
    (wantsInicio && !canSeeAlerts);

  useEffect(() => {
    if (session.kind === "loading") {
      return;
    }
    if (session.kind === "signed-in" && route === SIGN_IN_PATH) {
      navigate("/", { replace: true });
    } else if (session.kind !== "signed-in" && !isAccessRoute) {
      navigate(SIGN_IN_PATH, { replace: true });
    } else if (session.kind === "signed-in" && wantsUnlockedSection) {
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

  function handleSessionEnded() {
    clearSignedInMarker();
    setSession({ kind: "signed-out", notice: { kind: "expired" } });
    navigate(SIGN_IN_PATH, { replace: true });
  }

  useSessionWatcher({
    active: session.kind === "signed-in",
    checkStatus: checkSessionStatus,
    onEnded: handleSessionEnded,
    ...(session.kind === "signed-in" && session.expiresAt !== undefined
      ? { initialExpiresAt: session.expiresAt }
      : {}),
  });

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
      // The effect above already redirects to Mi cuenta: skip rendering the section, even briefly.
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
        canSeeAlerts={canSeeAlerts}
        canSeeCatalog={canSeeCatalog}
        catalogDefaultPath={catalogDefaultPath}
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
      return null;
    }
    return (
      <CatalogApp
        displayName={session.displayName}
        canSeeAlerts={canSeeAlerts}
        canManageCatalogProducts={canManageCatalogProducts}
        canSeePrices={canSeePrices}
        catalogDefaultPath={catalogDefaultPath}
        canSeeCash={canSeeCash}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        categoriesListScreenServices={categoriesListScreen}
        productsListScreenServices={productsListScreen}
        pricesListScreenServices={pricesListScreen}
      />
    );
  }

  if (isCashRoute) {
    if (session.kind !== "signed-in") {
      return null;
    }
    if (wantsUnlockedSection) {
      return null;
    }
    return (
      <CashApp
        displayName={session.displayName}
        canSeeAlerts={canSeeAlerts}
        canSeeCatalog={canSeeCatalog}
        catalogDefaultPath={catalogDefaultPath}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        fiscalConfigurationScreenServices={fiscalConfigurationScreen}
      />
    );
  }

  if (isInicioRoute) {
    if (session.kind !== "signed-in") {
      return null;
    }
    if (wantsUnlockedSection) {
      return null;
    }
    return (
      <InicioApp
        access={access}
        displayName={session.displayName}
        canSeeCatalog={canSeeCatalog}
        catalogDefaultPath={catalogDefaultPath}
        canSeeCash={canSeeCash}
        onSignedOut={handleSignedOut}
        onSessionEnded={handleSessionEnded}
        accountFooterServices={accountFooter}
        alertsListScreenServices={alertsListScreen}
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
          canSeeAlerts={canSeeAlerts}
          canSeeCatalog={canSeeCatalog}
          catalogDefaultPath={catalogDefaultPath}
          canSeeCash={canSeeCash}
          onSignedOut={handleSignedOut}
          accountFooterServices={accountFooter}
        />
      ) : null;
  }
}
