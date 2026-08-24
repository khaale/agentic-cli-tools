# GitLab Repositories Specification

## Purpose

Allow agents and shell users to inspect GitLab groups, projects, and repository contents through read-only, resource-first commands.

## Requirements

### Requirement: Inspect groups and namespaces

The system SHALL support listing groups, retrieving one group, and rendering a group tree, with optional group, search, state, sort, limit, refresh, and full-object controls.

#### Scenario: List top-level groups

- **WHEN** the user runs `glc groups list` without a group selector
- **THEN** the command returns matching groups using the default summary schema

#### Scenario: Render a group tree

- **WHEN** the user runs `glc groups tree --group <full-path>`
- **THEN** the command returns a hierarchical representation of the selected namespace

### Requirement: Inspect projects

The system SHALL support listing projects, retrieving one project, and rendering a project tree, using explicit group or project selectors and optional search, state, sort, limit, refresh, and full-object controls.

#### Scenario: List projects in a group

- **WHEN** the user runs `glc projects list --group <full-path>`
- **THEN** the command returns projects in that group using the restricted project summary by default

#### Scenario: Retrieve one project

- **WHEN** the user runs `glc projects get --project <path-with-namespace>`
- **THEN** the command returns the selected project or a not-found error

### Requirement: Inspect repository trees and refs

The system SHALL support listing repository tree entries, listing branches or tags, and reading one repository file using an explicit project selector and optional path, ref, page, limit, search, refresh, and full-object controls.

#### Scenario: Browse a repository path

- **WHEN** the user runs `glc repos tree --project <project> --ref <ref> --path <path>`
- **THEN** the command returns repository entries for that path and ref

#### Scenario: Read a repository file

- **WHEN** the user runs `glc repos file --project <project> --path <path> --ref <ref>`
- **THEN** the command returns the file contents in a raw-friendly form

### Requirement: Use stable summaries with opt-in full payloads

The system SHALL return restricted stable summaries by default and SHALL return the upstream GitLab objects only when `--full` is requested.

#### Scenario: Default project listing

- **WHEN** a project list is requested without `--full`
- **THEN** each item contains the documented stable project fields rather than the complete GitLab payload

### Requirement: Keep repository exploration read-only

The system SHALL perform only read operations for group, project, and repository commands and SHALL require explicit selectors for resource-specific operations.

#### Scenario: Missing project selector

- **WHEN** a repository operation is invoked without its required project selector
- **THEN** the command fails before making a resource request
