# GitLab Jobs Specification

## Purpose

Allow read-only inspection of GitLab CI/CD jobs and job traces.

## Requirements

### Requirement: List jobs

The system SHALL support listing jobs for a required project selector and optional pipeline, search, status, ref, scope, limit, refresh, and full-object controls according to the command surface.

#### Scenario: List jobs for a pipeline

- **WHEN** the user runs `glc jobs list --project <project> --pipeline <id>`
- **THEN** the command returns matching jobs using the stable job summary by default

### Requirement: Retrieve one job

The system SHALL support retrieving one job with a required project and job identifier.

#### Scenario: Get a job

- **WHEN** the user runs `glc jobs get --project <project> --job <id>`
- **THEN** the command returns the selected job or a not-found error

### Requirement: Read a job trace

The system SHALL support retrieving a job's trace as raw text for shell and diagnostic use.

#### Scenario: Get a job trace

- **WHEN** the user runs `glc jobs trace --project <project> --job <id>`
- **THEN** stdout contains the trace text without JSON decoration

### Requirement: Summarize job data

The system SHALL provide stable job summaries containing identifier, pipeline, name, stage, status, ref, duration, and web URL, with full upstream data available only when requested.

#### Scenario: Default job output

- **WHEN** a job list or get command is run without `--full`
- **THEN** the output uses the restricted stable schema
