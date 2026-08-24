# Kaiten Task Comments Specification

## Purpose

Provide read-only retrieval and stable rendering of comments attached to a Kaiten task.

## Requirements

### Requirement: Retrieve comments for a task

The system SHALL support `ktc task-comments get --task <id>` and SHALL require the task identifier before making the request.

#### Scenario: Get task comments

- **WHEN** the user runs `ktc task-comments get --task <id>`
- **THEN** the command requests the task's comments and returns normalized comment records

#### Scenario: Missing task selector

- **WHEN** the comments command is run without `--task`
- **THEN** the command fails with a CLI argument error

### Requirement: Normalize comment records

The system SHALL represent each comment with its identifier, author information, content, and creation/update timestamps when available.

#### Scenario: Comment has alternate upstream field names

- **WHEN** Kaiten returns comment text or timestamps under supported alternate field names
- **THEN** the normalized record exposes the canonical `content`, `created_at`, and `updated_at` fields

### Requirement: Render comments safely

The system SHALL support Markdown and JSON output, apply field projection before rendering, and anonymize comment authors in rendered output.

#### Scenario: Render a comment list as Markdown

- **WHEN** comments are requested without `--json`
- **THEN** stdout contains a Markdown comment list with a shortened anonymized author identity

#### Scenario: Render comments as JSON

- **WHEN** `--json` is requested
- **THEN** stdout contains valid JSON with the normalized comment records and anonymized identity values

### Requirement: Use read-only request and cache controls

The system SHALL fetch comments through the read-only Kaiten client, cache GET responses by default, bypass cached data with `--refresh`, and report request diagnostics only in verbose mode.

#### Scenario: Refresh comments

- **WHEN** the user runs the comments command with `--refresh`
- **THEN** the command bypasses the cached comment response and requests current data
