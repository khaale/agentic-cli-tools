# Kaiten Tasks Specification

## Purpose

Allow agents and shell users to find, inspect, and summarize Kaiten tasks through a read-oriented command surface.

## Requirements

### Requirement: List the current user's tasks

The system SHALL support `ktc tasks mine`, resolve the current Kaiten user, collect visible cards, normalize them into task records, and apply the shared task filters and limit controls.

#### Scenario: List my open tasks

- **WHEN** the user runs `ktc tasks mine --state open`
- **THEN** the command returns only open tasks assigned to the resolved current user

#### Scenario: Current user cannot be resolved

- **WHEN** the current user endpoint cannot provide a usable user identity
- **THEN** the command fails with an authentication/configuration error rather than returning unrelated tasks

### Requirement: Find tasks across selected Kaiten scope

The system SHALL support task search by text and filters for assignee, space, board, state, date boundaries, and result limit.

#### Scenario: Find tasks by board and text

- **WHEN** the user runs `ktc tasks find <query> --space <space> --board <board>`
- **THEN** the command scans the selected scope, applies the text and entity filters, sorts matches by recency, and returns them

#### Scenario: Unknown space or board

- **WHEN** a supplied space or board selector matches no entity
- **THEN** the command fails with a not-found error identifying the selector

### Requirement: Retrieve one task with lookup fallback

The system SHALL support `ktc tasks get --id <id>` and SHALL try the direct card endpoint before falling back to scanning accessible spaces and boards when necessary.

#### Scenario: Direct task lookup succeeds

- **WHEN** the direct card endpoint returns the requested task
- **THEN** the command returns the normalized task without scanning every board

#### Scenario: Direct lookup misses

- **WHEN** the direct lookup cannot find the task
- **THEN** the command searches accessible boards and returns the task if found, otherwise reports that the task was not found

### Requirement: Normalize task records

The system SHALL expose stable task records with identifiers, title, description, archived/state/status flags, assignee, space, board, column, lane, type, relations, timestamps, and URL when available.

#### Scenario: Derive task status

- **WHEN** a card is archived, completed, or located in a typed workflow column
- **THEN** the normalized task reports the corresponding `archived`, `done`, `in_progress`, or `open` status and `is_open` value

### Requirement: Keep task discovery read-only and agent-friendly

The system SHALL use read-only Kaiten requests, shared caching with `--refresh` bypass, deterministic sorting, optional field projection, and anonymized user information in rendered output.

#### Scenario: Render task details as Markdown

- **WHEN** a task is retrieved without `--json`
- **THEN** the output includes core facts and brief parent/child relations in Markdown without exposing raw user identity
