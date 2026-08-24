# @khaale/postgres-cli

## 0.2.2

### Patch Changes

- 923ce43: Add per-query row-limit overrides and UTF-8 SQL-file input for `pgc`.
- 923ce43: Align `pgc` command parsing and generated help with the `glc` and `ktc` CLI pattern.

## 0.2.1

### Patch Changes

- 3f05741: Fix self-contained CLI bundles so CommonJS dependencies load correctly in Node.js.

## 0.2.0

### Minor Changes

- b745a68: Add the read-only `pgc` PostgreSQL explorer for named sessions, progressive schema discovery (including comment-aware search, explicit continuation, and metadata availability), bounded queries, and cross-environment comparison.
