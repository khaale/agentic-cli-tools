## Purpose

Compare read-only PostgreSQL results from two named sessions so agents can investigate differences between environments such as QA and UAT.

## ADDED Requirements

### Requirement: Compare results of two read-only queries

The tool SHALL accept two distinct named sessions, an independently supplied read-only query for each side, and one or more key/primary-key columns used to align rows.

#### Scenario: Compare results of different queries across environments

- **WHEN** the caller provides left and right session names, a read-only query for each side, and key columns present under the same names in both results
- **THEN** the tool executes both queries independently, returns both source identities and a comparison result without exposing either session's credentials

#### Scenario: Compare the same session with itself

- **WHEN** both comparison sides resolve to the same session
- **THEN** the tool rejects the request unless an explicit diagnostic mode allows it, and explains that two distinct sources are required

### Requirement: Report row-level differences deterministically

The tool SHALL use caller-provided key/primary-key columns to align rows by the same-named values and SHALL distinguish matching rows, rows present only on the left, rows present only on the right, and rows whose same-named non-key values differ.

#### Scenario: Rows differ between sessions

- **WHEN** a key identifies rows in both results and one or more non-key values differ
- **THEN** the result identifies the key, changed fields, and left/right values in stable order

#### Scenario: A row exists on only one side

- **WHEN** a keyed row appears in only one result
- **THEN** the result classifies it as left-only or right-only and includes the bounded row representation for that side

### Requirement: Make comparison limits and incompleteness explicit

The tool SHALL apply the same safety limits as read-only queries and SHALL identify when either source was truncated, timed out, unavailable, or otherwise unsuitable for a complete comparison.

#### Scenario: One source is incomplete

- **WHEN** one query is limited, fails, or returns incompatible columns
- **THEN** the tool reports an incomplete comparison with per-source status and does not present the result as a complete equality assertion

### Requirement: Support compatible query shapes

The tool SHALL validate that both query results contain the requested key columns and compatible same-named non-key columns before calculating row differences, and SHALL report incompatible shapes as a structured error.

#### Scenario: Key or column shapes are incompatible

- **WHEN** a requested key is missing on one side or same-named comparison columns cannot be aligned
- **THEN** the tool returns a structured compatibility error describing the mismatch without returning credentials
