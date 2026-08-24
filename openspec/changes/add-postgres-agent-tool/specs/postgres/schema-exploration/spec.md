## Purpose

Expose large PostgreSQL schemas through bounded, navigable metadata views so an agent can progressively request only the detail needed for a task.

## ADDED Requirements

### Requirement: Return a bounded schema overview

The tool SHALL provide a compact overview of a selected session's databases, schemas, and object counts without returning every column or object definition by default.

#### Scenario: Request the initial schema view

- **WHEN** the caller requests a schema overview for a session
- **THEN** the result contains stable names, object counts, and navigation references for the available schemas and object types, subject to a documented result limit

#### Scenario: Overview exceeds the result limit

- **WHEN** the number of schemas or objects exceeds the configured limit
- **THEN** the result returns an explicit continuation marker or narrowing requirement and does not silently truncate the list

### Requirement: Disclose selected schema metadata on demand

The tool SHALL allow the caller to expand a selected schema, table, view, or routine and SHALL return only the requested metadata level.

#### Scenario: Expand a table

- **WHEN** the caller requests metadata for a specific table
- **THEN** the result includes its table comment, columns, column comments, types, nullability, keys, indexes, and relevant constraints within the requested limit

#### Scenario: Expand a selected column

- **WHEN** the caller requests details for a specific column
- **THEN** the result contains that column's type, nullability, default information, and relation context without returning unrelated table metadata

### Requirement: Keep schema navigation deterministic

The tool SHALL use stable ordering, fully qualified object identifiers, and explicit pagination or narrowing parameters for schema exploration.

#### Scenario: Repeat the same schema request

- **WHEN** the caller repeats an equivalent request against an unchanged session
- **THEN** objects and fields appear in the same order and use the same identifiers

### Requirement: Handle inaccessible or unsupported metadata safely

The tool SHALL distinguish unavailable metadata from an empty result and SHALL not expose credentials or unnecessary server error details when catalog access is restricted.

#### Scenario: Catalog access is restricted

- **WHEN** the connected role cannot inspect a requested catalog object
- **THEN** the result identifies the metadata as unavailable with a safe availability status/reason and preserves the rest of the navigable schema response

#### Scenario: Requested table does not exist

- **WHEN** the caller requests metadata for a table that is not present in the selected schema
- **THEN** the result identifies the table as `not_found` instead of presenting empty metadata as a successful table description

### Requirement: Search schema objects by name

The tool SHALL support bounded, case-aware or case-insensitive search by object name or PostgreSQL comment across supported objects, including tables, views, routines, and columns, with optional schema and object-type filters. Search results SHALL include the matching object's comment when available.

#### Scenario: Search for a table or column by name

- **WHEN** the caller supplies a name pattern and an optional object type
- **THEN** the tool returns matching fully qualified object references with object type and parent context, ordered deterministically and limited by the request

#### Scenario: Search for an object by comment

- **WHEN** the caller supplies a pattern that matches a table or column comment
- **THEN** the tool returns the fully qualified object reference, its object type, parent context where applicable, and the stored comment

#### Scenario: Search returns more matches than allowed

- **WHEN** the pattern matches more objects than the configured result limit
- **THEN** the result includes an explicit continuation marker or narrowing guidance and does not silently discard matches

#### Scenario: Search with no matches

- **WHEN** the pattern matches no accessible schema object
- **THEN** the tool returns an explicit empty result that is distinguishable from a catalog access failure

### Requirement: Expose directional foreign-key relationships

The tool SHALL expose incoming and outgoing foreign-key relationships for a selected table, including fully qualified endpoints, constraint identity, and ordered source/target column pairs.

#### Scenario: Inspect outgoing relationships

- **WHEN** the caller requests outgoing relationships for a table
- **THEN** the result lists foreign keys owned by that table and the referenced table/columns they target

#### Scenario: Inspect incoming relationships

- **WHEN** the caller requests incoming relationships for a table
- **THEN** the result lists foreign keys from other tables that reference the selected table and identifies their source columns

#### Scenario: Inspect a composite foreign key

- **WHEN** a relationship contains multiple key columns
- **THEN** the result preserves the constraint's column order and returns each source column paired with its corresponding target column

#### Scenario: Table has no relationships

- **WHEN** the selected table has no incoming or outgoing foreign keys
- **THEN** the tool returns an explicit empty relationship list for the requested direction
