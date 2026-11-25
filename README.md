# fork-ops

One reusable workflow that merges the newest upstream release into a fork, raises the version, and publishes a release. Each fork copies two small files.

## Version rule

A fork release uses `<upstream-patch+1>-fork.<N>`. Upstream `2.1.2` gives `2.1.3-fork.1`. Upstream `v0.26.3` gives `0.26.4-fork.1`.

- `<base>` is the upstream version with its patch number raised by one.
- `<N>` starts at 1 for each base and rises by one per release.
- A fork-only run also rises `N`, so `0.1.3-fork.3` gives `0.1.3-fork.4`.
- The version file never carries the tag prefix. `tagFormat` adds it to the tag only.
- The release name is the tag, character for character.

## Adoption

1. Copy `templates/upstream-sync.yml` to `.github/workflows/upstream-sync.yml`.
2. Copy `templates/fork-release.json` to `.github/fork-release.json`. Set `upstream` and the other fields for the fork.
3. Delete any local sync workflow.
4. Delete any push-triggered `release.yml`. This workflow publishes the release.
5. Commit and push to the default branch. Check the file against `schema/fork-release.schema.json`.

The caller declares no secret. It passes `secrets: inherit`, and the job never acts on another repository.

## Why the base gets a patch bump

Semver ranks a prerelease below its plain release. A plain upstream `2.1.2` therefore outranks `2.1.2-fork.1`, and BRAT would replace the fork build with the upstream build.

The patch bump ends that. `<base>` is always one patch above the upstream version that the run merges. A plain upstream release then ranks below every fork release for that base. `-fork.<N>` orders on its own, because semver reads the number numerically, so `-fork.10` beats `-fork.9`.

## The `v.06` rule

Tag comparison strips a leading `v` or `V`, then puts one `0` before a leading dot. Then it calls `semver.coerce` with `{ includePrerelease: true, loose: true }` and compares.

- `coerce('.06')`, `coerce('v.06')`, and `coerce('06')` return `6.0.0`, which is wrong.
- `coerce('0.06')` returns `0.6.0`, which is right.
- So upstream `v.06` gives base `0.6.1` and the first fork tag `v0.6.1-fork.1`.

The old `v.06-fork.1` tag reads as `6.0.0-fork.1`. It outranks every `0.6.x-fork.N` tag and must be replaced.

## The issue title

The workflow writes this issue only on a merge conflict or an allowlist rejection:

```
Upstream sync problem: <upstream-tag>
```

The body holds `@me` and the conflicted paths. A later run comments on the open issue with the same title. A build failure opens no issue, because the run shows the failure.

## Run a sync by hand

1. Open the fork on GitHub and select the **Actions** tab.
2. Select **Sync from upstream** and then **Run workflow**.
3. Enter a `tag` to merge one upstream release. Leave it blank to take the newest upstream release.
4. Set `force` only to publish over an existing release for the same base.
5. Select **Run workflow**.

The scheduled run uses the cron `17 7 * * *` and takes no input.

## Repository layout

- `.github/workflows/sync-release.yml` holds the reusable workflow.
- `scripts/config.mjs` reads and validates `.github/fork-release.json`.
- `scripts/normalize-tag.mjs` holds the tag comparison rule.
- `scripts/fork-version.mjs` computes `<base>-fork.<N>`.
- `scripts/release-plan.mjs` decides skip, publish, or sync.
- `scripts/write-version.mjs` writes the version into each version field.
- `scripts/resolve-version-conflicts.mjs` resolves version-only conflicts.
- `templates/` holds the two files to copy into a fork.
- `schema/fork-release.schema.json` holds the config schema.
- `tests/` holds the test suite. Run it with `npm test`.
