import type { DeactivateTagModalServices } from "./deactivate-tag-modal";
import type { EditTagModalServices } from "./edit-tag-modal";
import type { NewTagModalServices } from "./new-tag-modal";
import { fetchProducts } from "./products-api";
import type { ReactivateTagModalServices } from "./reactivate-tag-modal";
import { createTag, deactivateTag, editTag, fetchTags, reactivateTag } from "./tags-api";

export type TagsListScreenServices = {
  fetchTags: typeof fetchTags;
  fetchProducts: typeof fetchProducts;
} & NewTagModalServices &
  EditTagModalServices &
  DeactivateTagModalServices &
  ReactivateTagModalServices;

export const defaultTagsListScreenServices: TagsListScreenServices = {
  fetchTags,
  fetchProducts,
  createTag,
  editTag,
  deactivateTag,
  reactivateTag,
};
