import { isCategoryNameTooLong } from "@purosur/contracts";

export function categoryNameError(
  name: string,
  modalMessages: { nameRequired: string; nameTooLong: string },
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return modalMessages.nameRequired;
  }
  if (isCategoryNameTooLong(trimmed)) {
    return modalMessages.nameTooLong;
  }
  return undefined;
}
