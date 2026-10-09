import { codePointLength } from "../../shared/index.js";

export const SUPPLIER_NAME_MAX_LENGTH = 100;
export const SUPPLIER_CONTACT_MAX_LENGTH = 200;
export const SUPPLIER_NOTE_MAX_LENGTH = 200;

export function isSupplierNameTooLong(name: string): boolean {
  return codePointLength(name) > SUPPLIER_NAME_MAX_LENGTH;
}

export function isSupplierContactTooLong(contact: string): boolean {
  return codePointLength(contact) > SUPPLIER_CONTACT_MAX_LENGTH;
}

export function isSupplierNoteTooLong(note: string): boolean {
  return codePointLength(note) > SUPPLIER_NOTE_MAX_LENGTH;
}
