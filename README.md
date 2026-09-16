# Puro Sur POS

Local-first point of sale for a retail store: Electron + SQLite at the register, Fastify + Postgres in the cloud, one shared TypeScript domain.

- Layout: `packages/domain`, `packages/contracts`, `packages/ui`, `apps/pos`, `apps/cloud`, `apps/backoffice`.
- Code, identifiers, comments, tests and commit messages are written in English.

## Development

```
pnpm install
pnpm verify
```

`pnpm verify` is the same gate CI runs. See `CONTRIBUTING.md` for the full workflow.
