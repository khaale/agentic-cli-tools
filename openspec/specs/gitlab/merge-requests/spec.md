# GitLab Merge Requests Specification

## Purpose

Provide agent-friendly inspection of GitLab merge requests, their related datasets, versions, changes, and review snapshots.

## Requirements

### Requirement: List and retrieve merge requests

The system SHALL support merge request listing and retrieval with explicit group/project scoping and filters for search, state, sort, author, target/source branch, scope, date range, limit, refresh, and full payloads where applicable.

#### Scenario: List recently updated merge requests

- **WHEN** the user runs `glc mrs list --project <project> --since <date-spec>`
- **THEN** the command translates the date specification to an API boundary and returns matching merge requests

#### Scenario: Retrieve related merge request data

- **WHEN** the user runs `glc mrs get --project <project> --mr <iid> --with <datasets>`
- **THEN** the command returns the merge request together with the requested related datasets

### Requirement: Inspect merge request history and changes

The system SHALL support listing commits, pipelines, diff versions, and changes for a merge request, with optional diff text for changes and an explicit version selector.

#### Scenario: List merge request commits

- **WHEN** the user runs `glc mrs commits --project <project> --mr <iid>`
- **THEN** the command returns summarized commits for that merge request

#### Scenario: Request a merge request patch

- **WHEN** the user runs `glc mrs changes --project <project> --mr <iid> --patch`
- **THEN** the change items include diff text when GitLab provides it

### Requirement: Generate an agent-friendly snapshot bundle

The system SHALL support writing a deterministic merge request snapshot bundle containing a manifest and navigable overview, timeline, index, and per-file change artifacts for the requested datasets.

#### Scenario: Snapshot the latest diff

- **WHEN** the user runs `glc mrs snapshot --project <project> --mr <iid> --version latest --output-dir <dir>`
- **THEN** the command resolves `latest` to a concrete version and writes the snapshot to the requested directory

#### Scenario: Snapshot a changed file with unavailable diff

- **WHEN** GitLab marks a changed file as collapsed or too large
- **THEN** the snapshot keeps the file in metadata and explicitly indicates that its diff is unavailable

### Requirement: Return stable merge request summaries and anonymized identities

The system SHALL include stable identifiers, project, title, state, branches, timestamps, status, and web URL in default merge request summaries, and SHALL anonymize user identities in rendered output.

#### Scenario: Render a merge request list

- **WHEN** a merge request list is rendered without `--full`
- **THEN** each item uses the stable summary schema and does not expose the raw author identity
