import {
  BARCODE_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  PERMISSION_KEYS,
  type PermissionArea,
  type PermissionKey,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
} from "@purosur/contracts";
import { defineMessages } from "@purosur/ui";
import type { ProductStatusFilter } from "./productsApi";

// Every store is in Argentina, so a passkey's dates render in that timezone regardless of the
// browser's own clock, instead of drifting with wherever a device happens to be set to.
const PASSKEY_TIME_ZONE = "America/Argentina/Buenos_Aires";
const PASSKEY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: PASSKEY_TIME_ZONE,
};
const PASSKEY_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: PASSKEY_TIME_ZONE,
};

// Shared across the Users area's screens and modals, so the same copy is never typed twice.
const USERS_EYEBROW = "Configuración · Usuarios";
const EMAIL_LABEL = "Correo";
const EMAIL_REQUIRED = "Ingresá el correo.";
const EMAIL_INVALID = "Ingresá un correo válido.";
const EMAIL_TAKEN = "Ya existe un usuario con este correo.";
const CANCEL_LABEL = "Cancelar";
const CLOSE_LABEL = "Cerrar";
const ADMINISTRATOR_ROLE_NAME = "Administrador";

const CATEGORY_NAME_TOO_LONG = `El nombre puede tener hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`;
const PRODUCT_NAME_TOO_LONG = `El nombre puede tener hasta ${PRODUCT_NAME_MAX_LENGTH} caracteres.`;
const PRODUCT_MODAL_EYEBROW = "Catálogo · Productos";
const PRODUCT_CATEGORY_LABEL = "Categoría";
const PRODUCT_CATEGORY_REQUIRED = "Elegí una categoría.";
const PRODUCT_UNIT_LABEL = "Unidad de venta";
const PRODUCT_BARCODES_LABEL = "Códigos de barras";
const PRODUCT_SCAN_INPUT_LABEL = "Escanear otro código";
const PRODUCT_BARCODE_REQUIRED = "Escaneá al menos un código de barras.";
const PRODUCT_BARCODE_ALREADY_LISTED = "Ese código ya está en la lista.";
const PRODUCT_BARCODE_HAS_SPACES = "El código de barras no puede tener espacios.";
const PRODUCT_BARCODE_TOO_LONG = `El código de barras puede tener hasta ${BARCODE_MAX_LENGTH} caracteres.`;
const PRODUCT_BARCODE_LIMIT_REACHED = `El producto puede tener hasta ${PRODUCT_BARCODES_MAX_COUNT} códigos de barras.`;
const PRODUCT_BARCODE_INVALID = "Alguno de los códigos de barras no es válido.";
const PRODUCT_BARCODE_TAKEN_UNNAMED = "Alguno de los códigos ya es de otro producto.";
const PRODUCT_GENERATE_INTERNAL_BARCODE_LABEL = "Generar código interno";
const PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED =
  "No se pudo generar el código interno. Probá de nuevo.";
const ROLE_NAME_TOO_LONG = `El nombre puede tener hasta ${ROLE_NAME_MAX_LENGTH} caracteres.`;

// Shared between the Roles screen's per-permission checkboxes (all 48 keys, so a missing one is a
// type error) and the Alertas area's own radio/checkbox widget, which renders these same three
// permissions as a bespoke control instead of a plain checkbox list.
const VIEW_BRANCH_ALERTS_LABEL = "Ver alertas del local";
const VIEW_ALL_ALERTS_LABEL = "Ver todas las alertas";
const DISMISS_ALERTS_LABEL = "Cerrar alertas a mano";

// Every permission the catalog defines, in its own order, so a permission added to the catalog
// without a label here fails to compile instead of rendering blank.
const PERMISSION_LABELS = {
  sell_and_charge: "Vender y cobrar, incluido pesar a mano y abrir y cerrar su propia sesión",
  view_sales_history: "Consultar el historial de ventas",
  close_anothers_register_session: "Cerrar la sesión de caja de otra persona",
  reprint_receipt: "Reimprimir un ticket",
  record_cash_in: "Registrar un ingreso de efectivo",
  record_cash_expense: "Registrar un gasto pagado en efectivo",
  withdraw_cash: "Retirar efectivo de la caja",
  override_line_price_or_discount: "Cambiar el precio o aplicar un descuento a una línea",
  apply_total_discount: "Aplicar un descuento sobre el total",
  void_sale: "Anular una venta",
  process_return: "Hacer devoluciones",
  authorize_late_defect_refund: "Autorizar el reembolso de un defecto fuera de plazo",
  confirm_refunds: "Confirmar reembolsos",
  record_initial_inventory: "Inventario inicial",
  view_stock_balances: "Ver saldos",
  perform_stock_counts: "Recuentos",
  adjust_stock: "Ajustes",
  record_stock_losses: "Pérdidas",
  manage_suppliers: "Proveedores",
  manage_purchase_presentations: "Presentaciones de compra",
  record_purchases: "Registrar compras",
  manage_freight: "Flete",
  manage_expiration_dates: "Vencimientos",
  manage_supplier_price_lists: "Cargar y revisar listas de proveedores",
  compare_prices_and_suggest_orders: "Comparación de precios y sugerencia de pedido",
  manage_purchase_orders: "Pedidos",
  receive_purchase_orders: "Recibir pedidos",
  manage_products_and_categories: "Productos y categorías",
  manage_prices_and_review: "Precios y su revisión",
  manage_promotions: "Promociones",
  manage_recipes: "Recetas",
  manage_batches: "Tandas",
  reset_user_pin: "Reiniciar el PIN",
  deactivate_users: "Desactivar usuarios",
  correct_register_clock: "Corregir el reloj de la caja",
  view_fiscal_documents: "Ver comprobantes, contingencias y puntos de venta",
  close_fiscal_tasks: "Cerrar tareas fiscales",
  change_fiscal_configuration: "Cambiar la configuración fiscal",
  view_reports: "Ver reportes",
  view_branch_alerts: VIEW_BRANCH_ALERTS_LABEL,
  view_all_alerts: VIEW_ALL_ALERTS_LABEL,
  dismiss_alerts_manually: DISMISS_ALERTS_LABEL,
  enroll_register_devices: "Dar de alta cajas",
  revoke_register_devices: "Revocar cajas",
  view_bitlocker_key: "Consultar la clave de BitLocker",
  view_backups_and_rotate_key: "Ver backups y rotar la clave",
  recover_contingency_receipts: "Rescatar tickets de contingencia",
  configure_branch: "Configurar la sucursal",
} satisfies Record<PermissionKey, string>;

const AREA_LABELS = {
  cashRegister: "Caja",
  sale: "Venta",
  returns: "Devoluciones",
  checkout: "Cobro",
  stock: "Stock",
  purchasing: "Compras",
  catalog: "Catálogo",
  assembledProducts: "Productos armados",
  users: "Usuarios",
  fiscal: "Fiscal",
  reports: "Reportes",
  alerts: "Alertas",
  devices: "Dispositivos",
  backups: "Backups",
  branch: "Sucursal",
} satisfies Record<PermissionArea, string>;

export const messages = defineMessages("es-AR", (f) => ({
  shell: {
    brandName: "Puro Sur",
    areaRailLabel: "Áreas",
    signOut: {
      itemLabel: "Salir",
      title: "¿Salir del backoffice?",
      closeLabel: "Cerrar",
      cancel: "Cancelar",
      confirm: "Salir",
      failedTitle: "No se pudo salir",
      failedDetail: "Probá de nuevo.",
      rateLimitedTitle: "Demasiadas solicitudes",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
    },
  },
  access: {
    brandCaption: "Backoffice",
    signIn: {
      eyebrow: "Puro Sur",
      heading: "Ingresar",
      description:
        "Con la passkey de este dispositivo: la huella, la cara o el PIN de la computadora o del teléfono.",
      recoverLink: "Perdí mis passkeys",
      submit: "Ingresar con passkey",
      blockedTitle: "Demasiados intentos desde esta conexión",
      blockedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      expiredTitle: "Tu sesión venció",
      expiredDetail: "Se cierra sola a los 30 minutos sin uso o a las 12 horas de haber ingresado.",
      checkFailedTitle: "No pudimos verificar tu sesión",
      checkFailedDetail: "Probá de nuevo en unos minutos.",
      checkRateLimitedTitle: "Demasiadas solicitudes",
      checkRateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      attemptFailedTitle: "No se pudo ingresar",
      attemptFailedDetail: "Probá de nuevo.",
    },
    accountRecovery: {
      eyebrow: "Perdí mis passkeys",
      heading: "Recuperar el acceso",
      description: "Te mandamos un enlace al correo de tu cuenta para registrar una passkey nueva.",
      emailLabel: "Correo de tu cuenta",
      emailRequired: "Ingresá tu correo.",
      emailInvalid: "Ingresá un correo válido.",
      submit: "Enviar el enlace",
      backLink: "Volver a ingresar",
      rateLimitedTitle: "Demasiados pedidos de recuperación",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      errorTitle: "No pudimos enviar el enlace",
      errorDetail: "Probá de nuevo en unos minutos.",
      sentEyebrow: "Recuperar el acceso",
      sentHeading: "Revisá tu correo",
      sentNoticeTitle: "Si el correo es de una cuenta, te enviamos el enlace",
      sentNoticeDetail:
        "Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado.",
    },
    registerPasskey: {
      heading: "Registrá una passkey nueva",
      description: "Con ella vas a ingresar de ahora en adelante.",
      nameLabel: "Nombre de la passkey",
      nameHelper: "Por ejemplo, Notebook del local.",
      nameRequired: "Ingresá un nombre para la passkey.",
      nameTooLong: "El nombre no puede superar los 40 caracteres.",
      submit: "Registrar la passkey",
      footerHint:
        "Después conviene agregar una segunda, por ejemplo en el teléfono, desde Mi cuenta.",
      loading: "Abriendo el registro…",
      invalidTitle: "Este enlace no es válido",
      invalidDetail: "Revisá que el enlace esté completo.",
      burnedTitle: "Este enlace ya no se puede usar",
      burnedDetail: "Ya se usó o se pidió uno más nuevo.",
      expiredTitle: "Este enlace venció",
      expiredDetail: "Los enlaces valen 15 minutos.",
      requestNewLink: "Pedir un enlace nuevo",
      rateLimitedTitle: "Demasiados intentos desde esta conexión",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      loadErrorTitle: "No pudimos abrir el registro",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      attemptFailedTitle: "No se pudo registrar la passkey",
      attemptFailedDetail: "Podés volver a intentarlo con este mismo enlace.",
      successTitle: "Registraste la passkey",
      goToSignIn: "Ir a ingresar",
      sessionsClosedTitle: "Se cerraron las sesiones abiertas de tu cuenta",
      sessionsClosedDetail: "Si alguien más estaba adentro con tu cuenta, ya no lo está.",
    },
  },
  settings: {
    areaLabel: "Config",
    sectionsHeading: "Configuración",
    sectionsNavLabel: "Configuración",
    usersSectionLabel: "Usuarios",
    rolesSectionLabel: "Roles",
    branchSectionLabel: "Sucursal",
    // Shown instead of usersSectionLabel when Usuarios itself isn't unlocked, so Configuración
    // always has at least one sidebar entry.
    myAccountSectionLabel: "Mi cuenta",
    myAccount: {
      documentTitle: "Mi cuenta · Puro Sur",
      breadcrumb: (params: { name: string }) => `Configuración · ${params.name}`,
      heading: "Mi cuenta",
      passkeys: {
        title: "Passkeys",
        registerAnother: "Registrar otra passkey",
        noPasskeysWarning:
          "No tenés ninguna passkey. Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo.",
        rowDetail: (params: { registeredOn: Date; lastUsedAt?: Date; now: Date }) => {
          const registered = `Registrada el ${f.date(params.registeredOn, PASSKEY_DATE_OPTIONS)}`;
          if (!params.lastUsedAt) {
            return registered;
          }
          const time = f.date(params.lastUsedAt, PASSKEY_TIME_OPTIONS);
          const lastUsedDate = f.date(params.lastUsedAt, PASSKEY_DATE_OPTIONS);
          const sameDay = lastUsedDate === f.date(params.now, PASSKEY_DATE_OPTIONS);
          const lastUsed = sameDay
            ? `último uso hoy ${time}`
            : `último uso el ${lastUsedDate} ${time}`;
          return `${registered} · ${lastUsed}`;
        },
        remove: (params: { name: string }) => `Dar de baja la passkey «${params.name}»`,
        loading: "Cargando tus passkeys…",
        loadErrorTitle: "No pudimos abrir tus passkeys",
        loadErrorDetail: "Probá de nuevo en unos minutos.",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
        retry: "Reintentar",
        register: {
          eyebrow: "Mi cuenta · Passkeys",
          heading: "Registrar una passkey",
          nameLabel: "Nombre de la passkey",
          nameHelper: "Por ejemplo, Teléfono de Lucía.",
          nameRequired: "Ingresá un nombre para la passkey.",
          nameTooLong: "El nombre no puede superar los 40 caracteres.",
          cancel: "Cancelar",
          submit: "Registrar la passkey",
          closeLabel: "Cerrar",
          attemptFailedTitle: "No se pudo registrar la passkey",
          attemptFailedDetail: "Probá de nuevo.",
          rateLimitedTitle: "Demasiadas solicitudes",
          rateLimitedDetail: (params: { minutes: number }) =>
            `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
        },
        removeModal: {
          title: "¿Dar de baja la passkey?",
          body: (params: { name: string }) => `«${params.name}» deja de servir para entrar.`,
          onlyPasskeyWarning:
            "Es tu única passkey: para volver a entrar vas a tener que pedir el enlace de recuperación por correo.",
          cancel: "Cancelar",
          confirm: "Dar de baja",
          closeLabel: "Cerrar",
          attemptFailedTitle: "No se pudo dar de baja la passkey",
          attemptFailedDetail: "Probá de nuevo.",
          rateLimitedTitle: "Demasiadas solicitudes",
          rateLimitedDetail: (params: { minutes: number }) =>
            `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
        },
      },
    },
    users: {
      documentTitle: "Usuarios · Puro Sur",
      breadcrumb: "Configuración",
      heading: "Usuarios",
      newUserButton: "Nuevo usuario",
      administratorRoleName: ADMINISTRATOR_ROLE_NAME,
      columns: { user: "Usuario", role: "Rol", passkeys: "Passkeys" },
      count: (params: { count: number }) =>
        f.plural(params.count, { one: "1 usuario", other: `${params.count} usuarios` }),
      passkeysCount: (params: { count: number }) =>
        params.count === 0
          ? "—"
          : f.plural(params.count, { one: "1 registrada", other: `${params.count} registradas` }),
      loadErrorTitle: "No pudimos abrir los usuarios",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      rateLimitedTitle: "Demasiadas solicitudes",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      rowActionsLabel: "Acciones",
      editAria: (params: { name: string }) => `Editar a ${params.name}`,
      viewAria: (params: { name: string }) => `Ver a ${params.name}`,
      newUserModal: {
        eyebrow: USERS_EYEBROW,
        heading: "Nuevo usuario",
        nameLabel: "Nombre",
        nameRequired: "Ingresá el nombre.",
        roleLabel: "Rol",
        emailLabel: EMAIL_LABEL,
        emailRequired: EMAIL_REQUIRED,
        emailInvalid: EMAIL_INVALID,
        roleRequired: "Elegí un rol.",
        emailTaken: EMAIL_TAKEN,
        cancel: CANCEL_LABEL,
        submit: "Crear el usuario",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo crear el usuario",
        attemptFailedDetail: "Probá de nuevo.",
        unknownRoleTitle: "Ese rol ya no está disponible",
        unknownRoleDetail: "Cerrá esta ventana y volvé a intentarlo.",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
      detail: {
        breadcrumb: USERS_EYEBROW,
        heading: "Usuario",
        loading: "Cargando…",
        datosHeading: "Datos",
        editButton: "Editar",
        roleLabel: "Rol",
        emailLabel: EMAIL_LABEL,
        notFoundTitle: "No encontramos este usuario",
        backToList: "Volver a Usuarios",
        loadErrorTitle: "No pudimos abrir este usuario",
        loadErrorDetail: "Probá de nuevo en unos minutos.",
        passkeysLoading: "Cargando las passkeys…",
        passkeysLoadErrorTitle: "No pudimos abrir las passkeys",
        passkeysLoadErrorDetail: "Probá de nuevo en unos minutos.",
        passkeysEmpty: "No tiene ninguna passkey registrada.",
        deactivateHelp: (params: { name: string }) =>
          `Al desactivar a ${params.name}, deja de poder entrar a la caja y al backoffice; su historial queda igual.`,
        deactivateButton: (params: { name: string }) => `Desactivar a ${params.name}`,
      },
      deactivateModal: {
        title: (params: { name: string }) => `¿Desactivar a ${params.name}?`,
        body: "No se puede deshacer.",
        cancel: CANCEL_LABEL,
        confirm: "Desactivar",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo desactivar el usuario",
        attemptFailedDetail: "Probá de nuevo.",
      },
      removePasskeyModal: {
        title: (params: { name: string }) => `¿Dar de baja la passkey de ${params.name}?`,
        body: (params: { passkeyName: string }) =>
          `«${params.passkeyName}» deja de servir para entrar.`,
        onlyPasskeyWarning: (params: { name: string }) =>
          `Es su única passkey: para volver a entrar, ${params.name} va a tener que pedir el enlace de recuperación por correo.`,
      },
      editUserModal: {
        eyebrow: USERS_EYEBROW,
        roleLabel: "Rol",
        lockedRoleAria: "Por qué el rol está fijo",
        lastAdministratorTooltip:
          "Es el único Administrador activo. Para cambiarle el rol, primero hacé Administrador a otra persona.",
        emailLabel: EMAIL_LABEL,
        emailRequired: EMAIL_REQUIRED,
        emailInvalid: EMAIL_INVALID,
        emailTaken: EMAIL_TAKEN,
        cancel: CANCEL_LABEL,
        submit: "Guardar los cambios",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo guardar el cambio",
        attemptFailedDetail: "Probá de nuevo.",
        staleVersionTitle: "Este usuario cambió mientras lo editabas",
        staleVersionDetail: "Recargá sus datos y volvé a hacer el cambio.",
        lastAdministratorTitle: "Ahora es el único Administrador activo",
        lastAdministratorDetail:
          "Recargá sus datos: para cambiarle el rol, primero hacé Administrador a otra persona.",
        unknownRoleTitle: "Ese rol ya no está disponible",
        unknownRoleDetail: "Cerrá esta ventana y volvé a intentarlo.",
        reload: "Recargar",
        reloadFailedTitle: "No se pudieron recargar los datos",
      },
    },
    roles: {
      documentTitle: "Roles · Puro Sur",
      breadcrumb: "Configuración",
      heading: "Roles",
      newRoleButton: "Nuevo rol",
      administratorRoleName: ADMINISTRATOR_ROLE_NAME,
      allPermissionsLabel: "Todos los permisos",
      permissionsCount: (params: { count: number }) =>
        `${params.count} de ${PERMISSION_KEYS.length} permisos`,
      usersCount: (params: { count: number }) =>
        params.count === 0
          ? "Sin usuarios"
          : f.plural(params.count, { one: "1 usuario", other: `${params.count} usuarios` }),
      count: (params: { count: number }) =>
        f.plural(params.count, { one: "1 rol", other: `${params.count} roles` }),
      columns: { rol: "Rol", permisos: "Permisos", usuarios: "Usuarios" },
      loadErrorTitle: "No pudimos abrir los roles",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      rateLimitedTitle: "Demasiadas solicitudes",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      areaLabels: AREA_LABELS,
      permissionLabels: PERMISSION_LABELS,
      rowActionsLabel: "Acciones",
      editAria: (params: { name: string }) => `Editar el rol ${params.name}`,
      duplicateAria: (params: { name: string }) => `Duplicar el rol ${params.name}`,
      // The role editor modal (New, Edit and Duplicate all open the same one), its form and its
      // save confirmation step. A save that's rate limited shows the Roles area's own
      // rateLimitedTitle/rateLimitedDetail above instead of a key from this group.
      roleEditor: {
        eyebrow: "Configuración · Roles",
        closeLabel: CLOSE_LABEL,
        newTitle: "Nuevo rol",
        editTitle: "Editar rol",
        duplicateTitle: "Duplicar rol",
        // New and Duplicate both save by creating a role; only Edit saves by updating one.
        createSave: "Guardar el rol",
        editSave: "Guardar los cambios",
        cancel: CANCEL_LABEL,
        nameFromOriginal: (params: { name: string }) => `Copia de ${params.name}`,
        loading: "Cargando…",
        notFoundTitle: "No encontramos este rol",
        loadErrorTitle: "No pudimos abrir este rol",
        loadErrorDetail: "Probá de nuevo en unos minutos.",
        attemptFailedTitle: "No se pudo guardar el rol",
        attemptFailedDetail: "Probá de nuevo.",
        staleVersionTitle: "Este rol cambió mientras lo editabas",
        staleVersionDetail: "Recargá sus datos y volvé a hacer el cambio.",
        reload: "Recargar",
        reloadFailedTitle: "No se pudieron recargar los datos",
        cashRegisterTag: "Caja",
        pinTag: "PIN",
        cashRegisterTagTooltip: "Se usa en la caja.",
        pinTagTooltip:
          "En la caja, si quien atiende no tiene el permiso, lo autoriza con su PIN alguien que sí lo tenga.",
        selectedCount: (params: { count: number }) =>
          f.plural(params.count, {
            one: "1 permiso elegido",
            other: `${params.count} permisos elegidos`,
          }),
        confirmTitle: "¿Guardar los cambios?",
        confirmText: (params: { count: number; roleName: string }) =>
          `${f.plural(params.count, {
            one: "Se aplica a la 1 persona",
            other: `Se aplican a las ${params.count} personas`,
          })} con el rol ${params.roleName}:`,
        back: "Volver",
        // The name field and the areas/permissions panes.
        form: {
          nameLabel: "Nombre del rol",
          nameRequired: "Ingresá el nombre del rol.",
          nameTooLong: ROLE_NAME_TOO_LONG,
          nameReserved: "Ese nombre es del Administrador; elegí otro.",
          nameFieldError: "Revisá el nombre del rol.",
          nameTaken: "Ya existe un rol con este nombre.",
          areasGroupLabel: "Áreas de permisos",
          areaCount: (params: { count: number; total: number }) =>
            `${params.count} de ${params.total}`,
          alertsNoneOption: "No ve alertas",
          alertsBranchOption: VIEW_BRANCH_ALERTS_LABEL,
          alertsAllOption: VIEW_ALL_ALERTS_LABEL,
          dismissAlertsOption: DISMISS_ALERTS_LABEL,
        },
      },
    },
    branch: {
      documentTitle: "Sucursal · Puro Sur",
      breadcrumb: "Configuración",
      heading: "Sucursal",
      save: "Guardar los cambios",
      loading: "Cargando…",
      loadErrorTitle: "No pudimos abrir la sucursal",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      attemptFailedTitle: "No se pudo guardar la sucursal",
      attemptFailedDetail: "Probá de nuevo.",
      staleVersionTitle: "La sucursal cambió mientras la editabas",
      staleVersionDetail: "Recargá sus datos y volvé a hacer el cambio.",
      reload: "Recargar",
      reloadFailedTitle: "No se pudieron recargar los datos",
      ticketHeaderHeading: "Encabezado del ticket",
      hoursHeading: "Horario de atención",
      deadlinesHeading: "Plazos",
      addressLabel: "Dirección",
      whatsappLabel: "WhatsApp",
      instagramLabel: "Instagram",
      dayLabels: {
        monday: "Lunes",
        tuesday: "Martes",
        wednesday: "Miércoles",
        thursday: "Jueves",
        friday: "Viernes",
        saturday: "Sábado",
        sunday: "Domingo",
      },
      rangeSeparator: "a",
      rangeFieldLabel: (params: { day: string; index: number; part: "opensAt" | "closesAt" }) =>
        `${params.day}, horario ${params.index}, ${params.part === "opensAt" ? "abre" : "cierra"}`,
      removeRangeAria: (params: { day: string; index: number }) =>
        `Quitar el horario ${params.index} del ${params.day}`,
      addRangeAria: (params: { day: string }) => `Agregar un horario al ${params.day}`,
      closedLabel: "Cerrado",
      closedAria: (params: { day: string }) => `${params.day} — Cerrado`,
      expiringLotAlertDaysLabel: "Aviso de vencimiento",
      unreviewedPriceAlertDaysLabel: "Precio sin revisar",
      goodConditionReturnDaysLabel: "Cambio en buen estado",
      daysUnit: "días",
      textFieldError: "Ingresá como mucho 200 caracteres.",
      hoursOrderError: "La hora de cierre tiene que ser posterior a la de apertura.",
      hoursFormatError: "Ingresá la hora como 9:00 o 21:30.",
      hoursOverlapError: "Los horarios de un mismo día no se pueden superponer.",
      hoursInvalidError: "Revisá los horarios de este día.",
      daysFieldError: "Ingresá un número entero de 0 días o más.",
      daysTooLargeError: "Ingresá un número de días más chico.",
    },
  },
  catalog: {
    areaLabel: "Catálogo",
    sectionsHeading: "Catálogo",
    sectionsNavLabel: "Catálogo",
    categoriesSectionLabel: "Categorías",
    productsSectionLabel: "Productos",
    pricesSectionLabel: "Precios",
    products: {
      documentTitle: "Productos · Puro Sur",
      breadcrumb: "Catálogo",
      heading: "Productos",
      newProductButton: "Nuevo producto",
      printLabelsButton: "Imprimir etiquetas",
      searchPlaceholder: "Buscar por nombre o código de barras",
      categoryFilterLabel: "Categoría:",
      categoryFilterAllOption: "Todas",
      unitFilterLabel: "Unidad:",
      unitFilterAllOption: "Todas",
      unitOptionLabels: { UNIT: "Por unidad", KG: "Por peso" },
      statusFilterLabel: "Estado:",
      statusFilterActiveOption: "Activos",
      statusFilterInactiveOption: "Inactivos",
      statusFilterAllOption: "Todos",
      statusActive: "Activo",
      statusInactive: "Inactivo",
      columns: { product: "PRODUCTO", category: "CATEGORÍA", unit: "UNIDAD", status: "ESTADO" },
      count: (params: { count: number; status: ProductStatusFilter }) => {
        if (params.status === "active") {
          return f.plural(params.count, {
            one: "1 producto activo",
            other: `${params.count} productos activos`,
          });
        }
        if (params.status === "inactive") {
          return f.plural(params.count, {
            one: "1 producto inactivo",
            other: `${params.count} productos inactivos`,
          });
        }
        return f.plural(params.count, { one: "1 producto", other: `${params.count} productos` });
      },
      empty: {
        active: { title: "No hay productos activos", detail: "Creá uno para verlo en la lista." },
        inactive: { title: "No hay productos inactivos" },
        all: {
          title: "Todavía no hay productos",
          detail: "Creá el primero para verlo en la lista.",
        },
      } satisfies Record<ProductStatusFilter, { title: string; detail?: string }>,
      noResultsTitle: "Sin resultados",
      noResultsDetail: "Probá con otro nombre o código de barras.",
      loadErrorTitle: "No pudimos abrir los productos",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      rateLimitedTitle: "Demasiadas solicitudes",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      rowActionsLabel: "Acciones",
      editAria: (params: { name: string }) => `Editar el producto ${params.name}`,
      deactivateAria: (params: { name: string }) => `Desactivar el producto ${params.name}`,
      newProductModal: {
        eyebrow: PRODUCT_MODAL_EYEBROW,
        heading: "Nuevo producto",
        nameLabel: "Nombre",
        nameRequired: "Ingresá el nombre del producto.",
        nameTooLong: PRODUCT_NAME_TOO_LONG,
        categoryLabel: PRODUCT_CATEGORY_LABEL,
        categoryPlaceholder: "Elegí una categoría",
        categoryRequired: PRODUCT_CATEGORY_REQUIRED,
        unitLabel: PRODUCT_UNIT_LABEL,
        unitRequired: "Elegí la unidad de venta.",
        unitOptionUnitTitle: "Por unidad",
        unitOptionUnitHelp: "Se vende de a uno",
        unitOptionWeightTitle: "Por peso",
        unitOptionWeightHelp: "Se pesa en la balanza",
        barcodesLabel: PRODUCT_BARCODES_LABEL,
        scanInputLabel: PRODUCT_SCAN_INPUT_LABEL,
        generateButtonLabel: PRODUCT_GENERATE_INTERNAL_BARCODE_LABEL,
        generateFailed: PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
        barcodeRemoveAria: (params: { code: string }) => `Quitar el código ${params.code}`,
        barcodeRequired: PRODUCT_BARCODE_REQUIRED,
        barcodeAlreadyListed: PRODUCT_BARCODE_ALREADY_LISTED,
        barcodeHasSpaces: PRODUCT_BARCODE_HAS_SPACES,
        barcodeTooLong: PRODUCT_BARCODE_TOO_LONG,
        barcodeLimitReached: PRODUCT_BARCODE_LIMIT_REACHED,
        barcodeInvalid: PRODUCT_BARCODE_INVALID,
        barcodeTakenUnnamed: PRODUCT_BARCODE_TAKEN_UNNAMED,
        barcodeTaken: (params: { codes: string[] }) => {
          const list = params.codes.join(", ");
          return f.plural(params.codes.length, {
            one: `El código ${list} ya es de otro producto.`,
            other: `Los códigos ${list} ya son de otro producto.`,
          });
        },
        cancel: CANCEL_LABEL,
        submit: "Crear el producto",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo crear el producto",
        attemptFailedDetail: "Probá de nuevo.",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
      editProductModal: {
        eyebrow: PRODUCT_MODAL_EYEBROW,
        nameLabel: "Nombre",
        nameRequired: "Ingresá el nombre del producto.",
        nameTooLong: PRODUCT_NAME_TOO_LONG,
        categoryLabel: PRODUCT_CATEGORY_LABEL,
        categoryRequired: PRODUCT_CATEGORY_REQUIRED,
        unitLabel: PRODUCT_UNIT_LABEL,
        unitOptionUnitTitle: "Por unidad",
        unitOptionUnitHelp: "Se vende de a uno",
        unitOptionWeightTitle: "Por peso",
        unitOptionWeightHelp: "Se pesa en la balanza",
        barcodesLabel: PRODUCT_BARCODES_LABEL,
        scanInputLabel: PRODUCT_SCAN_INPUT_LABEL,
        generateButtonLabel: PRODUCT_GENERATE_INTERNAL_BARCODE_LABEL,
        generateFailed: PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
        barcodeRemoveAria: (params: { code: string }) => `Quitar el código ${params.code}`,
        barcodeRequired: PRODUCT_BARCODE_REQUIRED,
        barcodeAlreadyListed: PRODUCT_BARCODE_ALREADY_LISTED,
        barcodeHasSpaces: PRODUCT_BARCODE_HAS_SPACES,
        barcodeTooLong: PRODUCT_BARCODE_TOO_LONG,
        barcodeLimitReached: PRODUCT_BARCODE_LIMIT_REACHED,
        barcodeInvalid: PRODUCT_BARCODE_INVALID,
        barcodeTakenUnnamed: PRODUCT_BARCODE_TAKEN_UNNAMED,
        barcodeTaken: (params: { codes: string[] }) => {
          const list = params.codes.join(", ");
          return f.plural(params.codes.length, {
            one: `El código ${list} ya es de otro producto.`,
            other: `Los códigos ${list} ya son de otro producto.`,
          });
        },
        cancel: CANCEL_LABEL,
        submit: "Guardar los cambios",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo guardar el cambio",
        attemptFailedDetail: "Probá de nuevo.",
        staleVersionTitle: "Otra persona cambió este producto",
        staleVersionDetail:
          "Mientras lo editabas se guardó otra versión. Tus cambios no se guardaron: recargá el producto para verla y volvé a hacerlos.",
        notFoundTitle: "Este producto ya no existe",
        reload: "Recargar el producto",
        reloadFailedTitle: "No se pudieron recargar los datos",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
      deactivateModal: {
        title: (params: { name: string }) => `¿Desactivar ${params.name}?`,
        body: "Deja de ofrecerse en el catálogo y en las cajas. Las ventas que ya lo incluyen no cambian.",
        cancel: CANCEL_LABEL,
        confirm: "Desactivar",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo desactivar el producto",
        attemptFailedDetail: "Probá de nuevo.",
        alreadyInactiveTitle: "Ya estaba desactivado",
        reload: "Actualizar la lista",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
      printLabelsModal: {
        eyebrow: PRODUCT_MODAL_EYEBROW,
        heading: "Imprimir etiquetas",
        closeLabel: CLOSE_LABEL,
        intro: "Productos con código interno. Elegí cuántas etiquetas va a llevar cada uno.",
        decreaseAria: (params: { name: string }) => `Restar una etiqueta de ${params.name}`,
        increaseAria: (params: { name: string }) => `Sumar una etiqueta a ${params.name}`,
        previewAria: "Vista previa de la etiqueta",
        emptyTitle: "No hay productos activos con código interno",
        emptyDetail: "Generá uno desde el formulario de un producto activo.",
        summary: (params: { count: number }) =>
          f.plural(params.count, { one: "1 etiqueta", other: `${params.count} etiquetas` }),
        summaryDetail: "Hoja autoadhesiva para cualquier impresora común.",
        cancel: CANCEL_LABEL,
        download: "Descargar la hoja para imprimir",
        downloadFileName: "etiquetas.pdf",
        attemptFailedTitle: "No se pudo generar la hoja",
        attemptFailedDetail: "Probá de nuevo.",
        productsChangedTitle: "La lista de productos cambió",
        productsChangedDetail: "Recargá para ver los productos actualizados antes de imprimir.",
        reload: "Recargar la lista",
        reloadFailedTitle: "No se pudo recargar la lista",
        reloadFailedDetail: "Probá de nuevo.",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
    },
    categories: {
      documentTitle: "Categorías · Puro Sur",
      breadcrumb: "Catálogo",
      heading: "Categorías",
      newCategoryButton: "Nueva categoría",
      searchPlaceholder: "Buscar una categoría",
      columns: { category: "Categoría" },
      count: (params: { count: number }) =>
        f.plural(params.count, { one: "1 categoría", other: `${params.count} categorías` }),
      emptyTitle: "Todavía no hay categorías",
      emptyDetail: "Creá la primera para poder darle una a un producto.",
      noResultsTitle: "Sin resultados",
      noResultsDetail: "Probá con otro nombre.",
      loadErrorTitle: "No pudimos abrir las categorías",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      rateLimitedTitle: "Demasiadas solicitudes",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      rowActionsLabel: "Acciones",
      editAria: (params: { name: string }) => `Editar la categoría ${params.name}`,
      newCategoryModal: {
        eyebrow: "Catálogo",
        heading: "Nueva categoría",
        nameLabel: "Nombre de la categoría",
        nameRequired: "Ingresá el nombre de la categoría.",
        nameTooLong: CATEGORY_NAME_TOO_LONG,
        nameTaken: "Ya existe una categoría con este nombre.",
        cancel: CANCEL_LABEL,
        submit: "Crear la categoría",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo crear la categoría",
        attemptFailedDetail: "Probá de nuevo.",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
      editCategoryModal: {
        eyebrow: "Catálogo · Categorías",
        nameLabel: "Nombre de la categoría",
        nameRequired: "Ingresá el nombre de la categoría.",
        nameTooLong: CATEGORY_NAME_TOO_LONG,
        nameTaken: "Ya existe una categoría con este nombre.",
        cancel: CANCEL_LABEL,
        submit: "Guardar los cambios",
        closeLabel: CLOSE_LABEL,
        attemptFailedTitle: "No se pudo guardar el cambio",
        attemptFailedDetail: "Probá de nuevo.",
        staleVersionTitle: "Esta categoría cambió mientras la editabas",
        staleVersionDetail: "Recargá sus datos y volvé a hacer el cambio.",
        notFoundTitle: "Esta categoría ya no existe",
        reload: "Recargar",
        reloadFailedTitle: "No se pudieron recargar los datos",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
    },
    prices: {
      documentTitle: "Precios · Puro Sur",
      breadcrumb: "Catálogo",
      heading: "Precios",
      reviewButton: (params: { count: number }) =>
        f.plural(params.count, { one: "Revisar 1", other: `Revisar los ${params.count}` }),
      searchPlaceholder: "Buscar un producto",
      categoryFilterLabel: "Categoría:",
      categoryFilterAllOption: "Todas",
      reviewFilterLabel: "Revisión:",
      reviewFilterPendingOption: "Por revisar",
      reviewFilterAllOption: "Todos",
      columns: { product: "PRODUCTO", price: "PRECIO", reviewed: "REVISADO" },
      noPrice: "Sin precio",
      noPriceValue: "—",
      neverReviewed: "Nunca",
      reviewedToday: "Hoy",
      reviewedDaysAgo: (params: { days: number }) =>
        f.plural(params.days, { one: "Hace 1 día", other: `Hace ${params.days} días` }),
      rowActionsLabel: "Acciones",
      confirmAria: (params: { name: string }) =>
        `Confirmar el precio de ${params.name} sin cambios`,
      confirmTooltip: "Confirmar sin cambios: cuenta como revisar el precio.",
      editAria: (params: { name: string }) => `Cambiar el precio de ${params.name}`,
      footerPending: (params: { count: number }) =>
        f.plural(params.count, {
          one: "1 producto sin revisar, del más viejo al más nuevo",
          other: `${params.count} productos sin revisar, del más viejo al más nuevo`,
        }),
      footerAll: (params: { count: number }) =>
        f.plural(params.count, { one: "1 producto", other: `${params.count} productos` }),
      emptyPendingTitle: "Precios al día",
      emptyPendingDetail: (params: { days: number }) =>
        f.plural(params.days, {
          one: "Todos los precios se revisaron en el último día.",
          other: `Todos los precios se revisaron en los últimos ${params.days} días.`,
        }),
      noResultsTitle: "Sin resultados",
      noResultsDetail: "Probá con otro nombre o categoría.",
      loadErrorTitle: "No pudimos abrir los precios",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      rateLimitedTitle: "Demasiadas solicitudes",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      rowConfirmStaleTitle: "El precio cambió recién",
      rowConfirmStaleDetail: (params: { name: string }) =>
        `Revisá el precio actual de ${params.name}.`,
      rowConfirmFailedTitle: (params: { name: string }) =>
        `No se pudo confirmar el precio de ${params.name}`,
      goneTitle: "Producto desactivado",
      goneDetail: (params: { name: string }) => `${params.name} ya no está en el catálogo.`,
      confirmedNoticeTitle: "Precio confirmado",
      confirmedNoticeDetail: (params: { name: string; amount: string }) =>
        `${params.name} sigue a ${params.amount}.`,
      savedNoticeTitle: "Precio actualizado",
      savedNoticeDetail: (params: { name: string; amount: string }) =>
        `${params.name} pasa a ${params.amount}.`,
      changePriceModal: {
        eyebrowNoPrice: "SIN PRECIO",
        eyebrowOverdue: (params: { days: number }) =>
          f.plural(params.days, {
            one: "SIN REVISAR HACE 1 DÍA",
            other: `SIN REVISAR HACE ${params.days} DÍAS`,
          }),
        eyebrowRecentToday: "REVISADO HOY",
        eyebrowRecent: (params: { days: number }) =>
          f.plural(params.days, {
            one: "REVISADO HACE 1 DÍA",
            other: `REVISADO HACE ${params.days} DÍAS`,
          }),
        closeLabel: CLOSE_LABEL,
        priceLabel: { UNIT: "Precio de venta por unidad", KG: "Precio de venta por kilo" },
        unitSuffix: { UNIT: "", KG: "/ kg" },
        currentPriceHelper: (params: { amount: string }) => `Precio actual: ${params.amount}`,
        amountRequired: "Ingresá el precio nuevo.",
        amountInvalid: "Ingresá un precio válido, mayor a cero.",
        amountFormat: "Escribí el precio con coma para los decimales, por ejemplo 7.500,50.",
        amountTooLarge: "Ingresá un precio de hasta $ 21.474.836,47.",
        amountUnchanged: "Es el precio actual: confirmalo sin cambios en vez de guardarlo.",
        confirm: "Confirmar sin cambios",
        submit: "Guardar el precio nuevo",
        attemptFailedTitle: "No se pudo guardar el precio",
        attemptFailedDetail: "Probá de nuevo.",
        confirmFailedTitle: "No se pudo confirmar el precio",
        confirmFailedDetail: "Probá de nuevo.",
        staleTitle: "Este precio cambió mientras lo mirabas",
        staleDetail: "Recargá el precio actual y volvé a intentarlo.",
        reload: "Recargar el precio",
        reloadFailedTitle: "No se pudieron recargar los datos",
        rateLimitedTitle: "Demasiadas solicitudes",
        rateLimitedDetail: (params: { minutes: number }) =>
          `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      },
    },
  },
  cash: {
    areaLabel: "Caja",
    sectionsHeading: "Caja y fiscal",
    sectionsNavLabel: "Caja y fiscal",
    fiscalGroupLabel: "FISCAL",
    fiscalConfigurationSectionLabel: "Configuración fiscal",
    fiscalConfiguration: {
      documentTitle: "Configuración fiscal · Puro Sur",
      breadcrumb: "Caja y fiscal · Fiscal",
      heading: "Configuración fiscal",
      loading: "Cargando…",
      loadErrorTitle: "No pudimos abrir la configuración fiscal",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      issuerIdentification: {
        heading: "Identificación del emisor",
        edit: "Editar",
        legalNameLabel: "Razón social",
        cuitLabel: "CUIT",
        taxStatusLabel: "Condición frente al IVA",
        grossIncomeRegistrationLabel: "Ingresos Brutos",
        activityStartDateLabel: "Inicio de actividades",
        printedNotice: "Lo imprime cada factura y nota de crédito.",
        notLoaded: "Sin cargar",
        incompleteTitle: "Las cajas no están emitiendo facturas ni notas de crédito",
        incompleteDetail:
          "Hasta que se carguen los datos que faltan. Las ventas se siguen cobrando.",
      },
      editIssuerIdentificationModal: {
        eyebrow: "CONFIGURACIÓN FISCAL",
        title: "Identificación del emisor",
        closeLabel: CLOSE_LABEL,
        cancel: CANCEL_LABEL,
        submit: "Guardar los cambios",
        cuitLabel: "CUIT",
        taxStatusLabel: "Condición frente al IVA",
        legalNameLabel: "Razón social",
        legalNameRequired: "Ingresá la razón social.",
        legalNameTooLong: `Ingresá como mucho ${ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH} caracteres.`,
        grossIncomeRegistrationLabel: "Ingresos Brutos",
        grossIncomeRegistrationRequired: "Ingresá el número de Ingresos Brutos.",
        grossIncomeRegistrationTooLong: `Ingresá como mucho ${ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH} caracteres.`,
        activityStartDateLabel: "Inicio de actividades",
        activityStartDateRequired: "Elegí la fecha de inicio de actividades.",
        activityStartDateFuture: "La fecha no puede ser futura.",
        printedNotice:
          "Los comprobantes ya emitidos conservan los datos con los que se imprimieron.",
        attemptFailedTitle: "No se pudo guardar el cambio",
        attemptFailedDetail: "Probá de nuevo.",
        staleVersionTitle: "La identificación del emisor cambió mientras la editabas",
        staleVersionDetail: "Recargá los datos y volvé a hacer el cambio.",
        reload: "Recargar",
        reloadFailedTitle: "No se pudieron recargar los datos",
      },
    },
  },
  // The shared authorization modal every sensitive backoffice action opens on
  // `authorization_required`, one instance of copy reused everywhere instead of per screen.
  passkeyAuthorization: {
    title: "Autorizá este cambio",
    body: (params: { action: string }) =>
      `${params.action} necesita tu autorización. Confirmala con tu passkey.`,
    cancel: CANCEL_LABEL,
    confirm: "Usar mi passkey",
    closeLabel: CLOSE_LABEL,
    attemptFailedTitle: "No se pudo confirmar con tu passkey",
    attemptFailedDetail: "Probá de nuevo.",
    rateLimitedTitle: "Demasiadas solicitudes",
    rateLimitedDetail: (params: { minutes: number }) =>
      `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
    // One action sentence per call site; role create/edit/duplicate all save through the same
    // creation or edit request, so they share "roleSave", and both passkey-removal screens (an
    // Administrator removing another user's, and Mi cuenta removing one's own) share "passkeyRemoval".
    actions: {
      roleSave: "Guardar un rol",
      userCreate: "Crear un usuario",
      userEdit: "Editar un usuario",
      passkeyRemoval: "Dar de baja una passkey",
      passkeyRegistration: "Agregar una passkey",
      userDeactivation: "Desactivar un usuario",
      issuerIdentificationSave: "Guardar la identificación del emisor",
    },
  },
  help: {
    areaLabel: "Ayuda",
    documentTitle: "Ayuda · Puro Sur",
    pageDocumentTitle: (params: { page: string }) => `${params.page} · Ayuda · Puro Sur`,
    sectionsHeading: "Ayuda",
    sectionsNavLabel: "Secciones de ayuda",
    searchPlaceholder: "Buscar en la ayuda",
    breadcrumb: (params: { section: string }) => `Ayuda · ${params.section}`,
    relatedHeading: "También te puede servir",
    emptyTitle: "Todavía no hay contenido de ayuda",
    emptyBody: "Cuando se sumen funciones nuevas, sus artículos van a aparecer acá.",
    pickSectionTitle: "Elegí una sección",
    pickSectionBody: "O buscá un tema.",
    noResultsTitle: "Sin resultados",
    noResultsBody: "Probá con otras palabras.",
  },
}));
