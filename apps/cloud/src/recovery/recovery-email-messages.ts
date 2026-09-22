/**
 * The recovery-request email's copy, in Spanish (the only locale the product ships), kept as one
 * small catalog so the sender never carries user-facing text as a literal (CONTRIBUTING "Code
 * style"). Wording matches the backoffice's own screens for this flow (design.pen frames PK7Uo
 * and Pk5Ze): it never mentions that the request or the registration is audited.
 */
export const recoveryEmailMessages = {
  subject: "Recuperar el acceso a Puro Sur",
  heading: "Recuperar el acceso",
  intro: "Alguien pidió recuperar el acceso a tu cuenta de Puro Sur.",
  action: "Seguí este enlace para registrar una passkey nueva:",
  validity: "Vale 15 minutos y se usa una sola vez.",
  ignore: "Si no fuiste vos, podés ignorar este mensaje.",
};
