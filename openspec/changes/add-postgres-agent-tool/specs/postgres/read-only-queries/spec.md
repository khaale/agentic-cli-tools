## Purpose

Allow agents to inspect PostgreSQL data through bounded, machine-readable queries while making mutating operations unavailable through the tool by default.

## ADDED Requirements

### Requirement: Enforce read-only query execution

The tool SHALL execute every agent query in a read-only PostgreSQL transaction and SHALL reject statements that can mutate data, schema, session security, or transaction safety before execution.

#### Scenario: Execute a read query

- **WHEN** the caller submits an allowed read-only query to a selected session
- **THEN** the tool executes it in a read-only transaction and returns the result without changing database state

#### Scenario: Submit a mutating query

- **WHEN** the caller submits an INSERT, UPDATE, DELETE, MERGE, DDL, transaction-setting, or equivalent mutating statement
- **THEN** the tool rejects it before execution with a stable read-only error

#### Scenario: Database role has write privileges

- **WHEN** the selected database role has write privileges but the tool session is read-only
- **THEN** the tool still rejects mutating statements and the database transaction remains read-only

### Requirement: Bound query resource usage and result size

The tool SHALL apply a statement timeout, result row limit, and result byte limit to agent queries, and SHALL report when a result is limited or cancelled.

#### Scenario: Query returns more rows than allowed

- **WHEN** an allowed query produces more rows than the configured limit
- **THEN** the tool returns the bounded result with an explicit truncation indicator and safe continuation guidance

#### Scenario: Query exceeds the execution timeout

- **WHEN** an allowed query exceeds the session's statement timeout
- **THEN** the tool cancels or terminates the operation and returns a timeout error without leaking raw connection details

### Requirement: Support parameterized queries and stable output

The tool SHALL accept query parameters separately from SQL text, return column metadata and rows in stable JSON form, and support a compact output mode.

#### Scenario: Query with parameters

- **WHEN** the caller supplies SQL text and a matching parameter list
- **THEN** the tool binds the parameters without string interpolation and returns the selected columns and rows in the requested output format

#### Scenario: Invalid query or parameter shape

- **WHEN** SQL cannot be parsed or the supplied parameters do not match the query
- **THEN** the tool returns a machine-readable query error with safe diagnostics and does not execute a partial operation

### Requirement: Protect sensitive result data by default

The tool SHALL support explicit field selection and bounded output, and SHALL avoid including connection credentials in query diagnostics or metadata.

#### Scenario: Query error contains a sensitive target

- **WHEN** PostgreSQL returns an error containing a credential-bearing connection target
- **THEN** the tool sanitizes the error before returning it to the agent
