/**
 * The recovery-request email's copy, in Spanish (the only locale the product ships), kept as one
 * small catalog so the sender never carries user-facing text as a literal. Wording matches the
 * backoffice's own screens for this flow: it never mentions that the request or the registration
 * is audited.
 */
export const recoveryEmailMessages = {
  subject: "Recuperar el acceso a Puro Sur",
  heading: "Recuperar el acceso",
  intro: "Se pidió recuperar el acceso a tu cuenta de Puro Sur.",
  action: "Usá este enlace para registrar una passkey nueva:",
  validity: "Vale 15 minutos y se usa una sola vez.",
  ignore: "Si no lo pediste, podés ignorar este mensaje.",
};
