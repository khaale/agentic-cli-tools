---
"@khaale/cli-core": minor
"@khaale/gitlab-cli": minor
"@khaale/kaiten-cli": minor
---

Add --since and --till flags to glc mrs list, ktc tasks find, and ktc tasks mine for time-windowed reporting.

- Support relative durations like 1h, 1d, 2w, 1m (month), 1y.
- Support ISO8601 absolute timestamps.
- GitLab: Server-side filtering using updated_after/updated_before.
- Kaiten: Client-side filtering with early-stop optimization for the card list.
