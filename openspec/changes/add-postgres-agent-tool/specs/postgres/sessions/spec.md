## Purpose

Provide safe, named PostgreSQL connection sessions that agents can select without receiving passwords or other connection secrets.

## ADDED Requirements

### Requirement: Resolve a PostgreSQL session by name

The tool SHALL allow a caller to select a configured PostgreSQL connection using a non-secret session name such as `qa` or `uat`.

#### Scenario: Select a configured session

- **WHEN** the caller requests a known session name
- **THEN** the tool uses that session's effective connection configuration and returns the session name and non-secret connection metadata

#### Scenario: Unknown session name

- **WHEN** the caller requests a session name that is not configured
- **THEN** the tool returns a stable configuration error identifying the missing session name without exposing any configured secrets

### Requirement: Keep connection secrets out of agent-visible output

The tool SHALL resolve passwords, secret references, and credential-bearing connection values only for establishing the connection, and SHALL redact them from results, diagnostics, errors, logs, and configuration views.

#### Scenario: Inspect configured sessions

- **WHEN** the caller lists or inspects configured sessions
- **THEN** the output contains session names and safe metadata such as host, port, database, and read-only policy, but no password or credential-bearing connection string

#### Scenario: Connection failure with credentials configured

- **WHEN** a connection attempt fails for a session that uses a password
- **THEN** the error identifies the session and sanitized connection target without including the password or raw driver error text that contains it

### Requirement: Validate session configuration before connecting

The tool SHALL validate session names, required connection fields, secret references, and read-only policy values before opening a connection, and SHALL report invalid configuration as a machine-readable error.

#### Scenario: Invalid session definition

- **WHEN** a configured session lacks a required connection field or references an unavailable secret
- **THEN** the tool rejects the session with an actionable validation error and does not attempt a connection

### Requirement: Provide secret-safe connection diagnostics

The tool SHALL report whether a named session is configured and reachable, including server/version checks and effective safety settings, without returning database credentials.

#### Scenario: Successful session diagnosis

- **WHEN** the caller diagnoses a configured session
- **THEN** the output reports connectivity, PostgreSQL identity/version metadata, and read-only enforcement status while keeping credentials redacted
