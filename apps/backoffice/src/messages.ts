import {
  CATEGORY_NAME_MAX_LENGTH,
  PERMISSION_KEYS,
  type PermissionArea,
  type PermissionKey,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/contracts";
import { defineMessages } from "@purosur/ui";

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
      },
      removePasskeyModal: {
        title: (params: { name: string }) => `¿Dar de baja la passkey de ${params.name}?`,
        body: (params: { passkeyName: string }) =>
          `«${params.passkeyName}» deja de servir para entrar.`,
        onlyPasskeyWarning: (params: { name: string }) =>
          `Es su única passkey: para volver a entrar, ${params.name} va a tener que pedir el enlace de recuperación por correo.`,
      },
      editEmailModal: {
        eyebrow: USERS_EYEBROW,
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
      cashRegisterBadgeLabel: "Caja",
      pinBadgeLabel: "Caja · con PIN de otra persona",
      areaLabels: AREA_LABELS,
      permissionLabels: PERMISSION_LABELS,
      rowActionsLabel: "Acciones",
      editAria: (params: { name: string }) => `Editar el rol ${params.name}`,
      duplicateAria: (params: { name: string }) => `Duplicar el rol ${params.name}`,
      // Shared by the New, Edit and Duplicate role pages: the one role form they all render.
      form: {
        nameLabel: "Nombre del rol",
        nameRequired: "Ingresá el nombre del rol.",
        nameReserved: "Ese nombre es del Administrador; elegí otro.",
        nameFieldError: "Revisá el nombre del rol.",
        nameTaken: "Ya existe un rol con este nombre.",
        referencesPinHelper:
          "Si quien está en la caja no tiene el permiso, lo autoriza con su PIN alguien que sí lo tenga.",
        administratorOnlyHelper:
          "Crear y editar roles, dar de alta usuarios y asignarles un rol queda solo para el Administrador.",
        areaCount: (params: { count: number; total: number }) =>
          `${params.count} de ${params.total}`,
        alertsNoneOption: "No ve alertas",
        alertsBranchOption: VIEW_BRANCH_ALERTS_LABEL,
        alertsAllOption: VIEW_ALL_ALERTS_LABEL,
        dismissAlertsOption: DISMISS_ALERTS_LABEL,
      },
      // Shared by every role page (New, Edit and Duplicate); a save that's rate limited shows the
      // Roles area's own rateLimitedTitle/rateLimitedDetail above.
      rolePage: {
        breadcrumb: "Configuración · Roles",
        cancel: CANCEL_LABEL,
        attemptFailedDetail: "Probá de nuevo.",
      },
      // Shared by the Edit and Duplicate role pages, which both load a role before showing its form.
      roleLoad: {
        loading: "Cargando…",
        notFoundTitle: "No encontramos este rol",
        loadErrorTitle: "No pudimos abrir este rol",
        loadErrorDetail: "Probá de nuevo en unos minutos.",
      },
      // Shared by the New and Duplicate role pages, which both save by creating a role.
      roleCreation: {
        save: "Guardar el rol",
        attemptFailedTitle: "No se pudo crear el rol",
      },
      newRole: {
        heading: "Nuevo rol",
      },
      editRole: {
        heading: "Editar rol",
        save: "Guardar los cambios",
        attemptFailedTitle: "No se pudo guardar el rol",
        staleVersionTitle: "Este rol cambió mientras lo editabas",
        staleVersionDetail: "Recargá sus datos y volvé a hacer el cambio.",
        reload: "Recargar",
        reloadFailedTitle: "No se pudieron recargar los datos",
      },
      duplicateRole: {
        heading: "Duplicar rol",
        nameFromOriginal: (params: { name: string }) => `Copia de ${params.name}`,
      },
    },
  },
  catalog: {
    areaLabel: "Catálogo",
    sectionsHeading: "Catálogo",
    sectionsNavLabel: "Catálogo",
    categoriesSectionLabel: "Categorías",
    productsSectionLabel: "Productos",
    products: {
      documentTitle: "Productos · Puro Sur",
      breadcrumb: "Catálogo",
      heading: "Productos",
      newProductButton: "Nuevo producto",
      searchPlaceholder: "Buscar por nombre o código de barras",
      categoryFilterLabel: "Categoría:",
      categoryFilterAllOption: "Todas",
      unitFilterLabel: "Unidad:",
      unitFilterAllOption: "Todas",
      unitOptionLabels: { UNIT: "Por unidad", KG: "Por peso" },
      columns: { product: "PRODUCTO", category: "CATEGORÍA", unit: "UNIDAD" },
      count: (params: { count: number }) =>
        f.plural(params.count, { one: "1 producto", other: `${params.count} productos` }),
      emptyTitle: "Todavía no hay productos",
      emptyDetail: "Creá el primero para verlo en la lista.",
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
      newProductModal: {
        eyebrow: PRODUCT_MODAL_EYEBROW,
        heading: "Nuevo producto",
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
        barcodeRemoveAria: (params: { code: string }) => `Quitar el código ${params.code}`,
        barcodeRequired: PRODUCT_BARCODE_REQUIRED,
        barcodeAlreadyListed: PRODUCT_BARCODE_ALREADY_LISTED,
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
        barcodeRemoveAria: (params: { code: string }) => `Quitar el código ${params.code}`,
        barcodeRequired: PRODUCT_BARCODE_REQUIRED,
        barcodeAlreadyListed: PRODUCT_BARCODE_ALREADY_LISTED,
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
      emailChange: "Cambiar el correo de un usuario",
      passkeyRemoval: "Dar de baja una passkey",
      passkeyRegistration: "Agregar una passkey",
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
