import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

export const creationOptions: PublicKeyCredentialCreationOptionsJSON = {
  challenge: "Y2hhbGxlbmdl",
  rp: { name: "Puro Sur", id: "purosur.online" },
  user: { id: "dXNlci0x", name: "lucia.perez@purosur.online", displayName: "Lucía" },
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
};
