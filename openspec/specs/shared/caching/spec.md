# File Caching Specification

## Purpose

Provide deterministic JSON-file caching for read-oriented CLI requests.

## Requirements

### Requirement: Cache entries by stable request key

The system SHALL store each cache entry as JSON under a filename derived from a SHA-256 digest of the request key, together with the key, scope, timestamps, status, and data supplied by the caller.

#### Scenario: Store and retrieve a cache entry

- **WHEN** a caller stores a value and later requests the same key before expiry
- **THEN** the cache returns the stored entry and its data without requiring a network request

#### Scenario: Missing cache entry

- **WHEN** no file exists for a requested key
- **THEN** the cache returns no entry

### Requirement: Honor expiry and refresh bypass

The system SHALL treat an entry with an expired `expiresAt` timestamp as unavailable and SHALL bypass cache reads when the caller requests refresh.

#### Scenario: Expired entry

- **WHEN** a cache entry has expired
- **THEN** a read returns no entry so the caller can fetch fresh data

#### Scenario: Explicit refresh

- **WHEN** a read is performed with `refresh`
- **THEN** the cache returns no entry even if a valid entry exists

### Requirement: Inspect and clear cache entries by scope

The system SHALL list valid JSON entries with metadata sorted newest first, ignore malformed entries during listing, and clear only entries matching supplied non-empty scope filters.

#### Scenario: List cache status

- **WHEN** a caller requests cache status
- **THEN** the result includes entry keys, scopes, timestamps, and file sizes

#### Scenario: Clear a scoped cache

- **WHEN** a caller clears the cache with a project or group scope
- **THEN** only matching entries are removed and the removed entries are reported

### Requirement: Keep cache failures explicit

The system SHALL tolerate a missing cache directory as an empty cache and SHALL propagate filesystem failures other than missing files or intentionally ignored malformed entries.

#### Scenario: Cache directory does not exist

- **WHEN** a cache is listed before it has been created
- **THEN** the result is an empty list
