// The main process's own es-AR catalog. The register's catalog is built with the UI package's
// defineMessages, and importing it here would bundle that whole package, React included, into main.
export const mainMessages = {
  startFailure: {
    title: "La caja no puede iniciar",
    detail: "La instalación de la caja está dañada. Se soluciona instalándola de nuevo.",
  },
} as const;
