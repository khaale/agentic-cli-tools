# @khaale/kaiten-cli

## 0.3.0

### Minor Changes

- a30c8eb: Add --since and --till flags to glc mrs list, ktc tasks find, and ktc tasks mine for time-windowed reporting.

  - Support relative durations like 1h, 1d, 2w, 1m (month), 1y.
  - Support ISO8601 absolute timestamps.
  - GitLab: Server-side filtering using updated_after/updated_before.
  - Kaiten: Client-side filtering with early-stop optimization for the card list.

## 0.2.0

### Minor Changes

- 09886da: Added `task-comments get` command to fetch and summarize comments for a specific task.

### Patch Changes

- 586479e: Rebranded the project to agentic-cli-tools and fixed platform-dependent path issues in tests.
