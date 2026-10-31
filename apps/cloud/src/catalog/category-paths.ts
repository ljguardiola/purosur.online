import { sql } from "drizzle-orm";

export const categoryPaths = sql`(
  with recursive walk(id, path) as (
    select id, array[name] from categories where parent_id is null
    union all
    select child.id, walk.path || child.name from categories child join walk on child.parent_id = walk.id
  )
  select id, path from walk
) as category_paths`;
