# GitLab Pipelines Specification

## Purpose

Allow read-only inspection of GitLab CI/CD pipelines for a selected project.

## Requirements

### Requirement: List pipelines

The system SHALL support listing pipelines for a required project selector with optional search, state, sort, limit, refresh, and full-object controls.

#### Scenario: List recent pipelines

- **WHEN** the user runs `glc pipelines list --project <project>`
- **THEN** the command returns matching pipelines using the stable pipeline summary by default

#### Scenario: Limit pipeline results

- **WHEN** the user supplies `--limit <n>`
- **THEN** the command returns no more than the requested number of pipeline items

### Requirement: Retrieve one pipeline

The system SHALL support retrieving one pipeline using a required project and pipeline identifier.

#### Scenario: Get a pipeline

- **WHEN** the user runs `glc pipelines get --project <project> --pipeline <id>`
- **THEN** the command returns the selected pipeline or a not-found error

### Requirement: Summarize pipeline data

The system SHALL provide stable pipeline summaries containing identifier, project, ref, status, source, SHA, creation time, and web URL, with full upstream data available only when requested.

#### Scenario: Default pipeline output

- **WHEN** a pipeline command is run without `--full`
- **THEN** the output uses the restricted stable schema

### Requirement: Honor read and cache controls

The system SHALL perform pipeline operations as read-only requests, use the shared cache by default, bypass it with `--refresh`, and emit cache diagnostics only when verbose mode is requested.

#### Scenario: Refresh pipeline data

- **WHEN** the user runs a pipeline command with `--refresh`
- **THEN** the command bypasses an existing cached response and fetches current data
