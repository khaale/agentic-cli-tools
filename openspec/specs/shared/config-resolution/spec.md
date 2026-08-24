# Config Resolution Specification

## Purpose

Provide platform-agnostic configuration discovery, normalization, persistence, and source reporting for the workspace CLIs.

## Requirements

### Requirement: Resolve tool configuration paths by platform

The system SHALL resolve each tool's configuration file from the operating system conventions and SHALL allow the environment and test/runtime options to override the relevant roots.

#### Scenario: Resolve the default configuration path

- **WHEN** a tool requests its configuration path without an explicit override
- **THEN** the system returns a tool-specific `config.json` path under the platform's standard configuration directory

#### Scenario: Resolve a cache directory

- **WHEN** a tool has no configured cache directory
- **THEN** the system returns a tool-specific cache directory under the platform's standard cache location

### Requirement: Apply configuration precedence

The system SHALL resolve each configured key using environment values before persisted configuration values, and SHALL use a built-in default when neither source provides a value.

#### Scenario: Environment overrides persisted configuration

- **WHEN** the same key is present in the environment and in the tool configuration file
- **THEN** the effective value comes from the environment and its source is reported as `env`

#### Scenario: Missing optional configuration

- **WHEN** an optional key is absent from both sources
- **THEN** the system returns its default value or `null` according to the key's contract

### Requirement: Validate and normalize configuration values

The system SHALL trim and validate string, URL, boolean, and cache-path values before using or persisting them, and SHALL report invalid configuration as a CLI error.

#### Scenario: Invalid JSON configuration

- **WHEN** the persisted configuration is not valid JSON or is not an object
- **THEN** the system reports an invalid configuration error with the configuration path

#### Scenario: Invalid URL configuration

- **WHEN** a configured service URL is not a valid URL
- **THEN** the system rejects the value with a configuration error

### Requirement: Persist configuration safely

The system SHALL create missing configuration directories, write configuration through a temporary file, replace the target atomically, and use restrictive POSIX modes where supported.

#### Scenario: Initialize a new configuration

- **WHEN** the user runs a tool's configuration initialization without `--force` and no file exists
- **THEN** the system writes the selected non-empty values and returns the path, configured keys, and their sources

#### Scenario: Refuse to overwrite an existing configuration

- **WHEN** the configuration file exists and initialization is run without `--force`
- **THEN** the system fails with a configuration error and preserves the existing file

### Requirement: Avoid exposing secrets in configuration views

The system SHALL expose effective configuration metadata and paths without printing raw authentication tokens.

#### Scenario: Inspect effective configuration

- **WHEN** the user requests the effective configuration
- **THEN** the output identifies the configuration path and configured keys while redacting secret values
