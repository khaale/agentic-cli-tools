# Output Formatting Specification

## Purpose

Define common machine-readable output, field projection, error envelopes, diagnostics, and anonymization primitives used by the CLIs.

## Requirements

### Requirement: Provide predictable JSON output

The system SHALL serialize successful structured results as JSON and SHALL support compact serialization when requested.

#### Scenario: Pretty JSON output

- **WHEN** a command returns structured data without compact mode
- **THEN** stdout contains valid indented JSON followed by a newline

#### Scenario: Compact JSON output

- **WHEN** compact mode is requested
- **THEN** stdout contains equivalent JSON without pretty indentation

### Requirement: Project selected fields

The system SHALL apply a comma-separated field projection to objects and arrays before rendering output when fields are requested.

#### Scenario: Project an object

- **WHEN** the user requests a selected field set
- **THEN** the output contains those fields in the same object shape and omits unselected fields

#### Scenario: Project a list

- **WHEN** the user applies a field set to an array
- **THEN** the projection is applied independently to every item

### Requirement: Emit a machine-readable error envelope

The system SHALL represent JSON-mode failures as an object with `ok: false` and an `error` object containing a code and message, with optional details.

#### Scenario: Command failure in JSON mode

- **WHEN** parsing, configuration, API, or runtime handling fails while JSON mode is requested
- **THEN** stdout contains the JSON error envelope and the process uses the command's exit code

### Requirement: Normalize diagnostic reports and redact secrets

The system SHALL provide a stable diagnostic shape containing tool, version, configuration path, authentication availability/source, cache location, checks, and missing values, and SHALL redact authentication tokens.

#### Scenario: Diagnostic report with a token

- **WHEN** a doctor command includes authentication information
- **THEN** the report indicates whether a token is available and its source without exposing the token

### Requirement: Preserve stable anonymized identities

The system SHALL normalize identity values before hashing them and SHALL use deterministic `sha256:` identities when a product-specific output policy requires anonymization.

#### Scenario: Same identity appears repeatedly

- **WHEN** the same normalized user identity is rendered more than once
- **THEN** it receives the same anonymized identity in every output
