# Fork operations: shared sync, uniform releases, tolerant updates

Date: 2026-11-24
Status: draft for approval

## Intent

Six of my repositories are forks that track an upstream project. Each one carries its own copy of an upstream-sync workflow. Each one computes version numbers in its own way. My vaults install those forks through BRAT, and BRAT cannot see fork releases.

I want three outcomes:

- One place holds the sync and release logic.
- Every fork releases the same way, with the same version shape.
- My vaults receive fork releases without manual work.

## The six forks in scope

| repo | upstream | current tag style |
|---|---|---|
| obsidian-onedrive | JeffSteinbok/obsidian-onedrive | `2.1.2-fork.1` |
| obsidian-openagent | nikitaclicks/obsidian-openagent | `0.1.2` to `0.1.5` (plain) |
| pi-subagents | tintinweb/pi-subagents | `v0.26.3-fork.1` |
| deadbeef-lyricbar | AsVHEn/deadbeef-lyricbar | `v.06-fork.1` |
| superpowers | obra/superpowers | none |
| pi-paster | beowulf11/pi-paster | none (tag push path) |

## Goals

- A new repository, `DecibillyJoel/fork-ops`, contains the only copy of the sync job, the release job, and the version scripts.
- Each fork holds a short caller file. A change in `fork-ops` reaches every fork without a commit in any fork.
- A fork release always has the shape `<upstream-patch-plus-one>-fork.<N>`. Upstream `2.1.2` yields `2.1.3-fork.1`.
- A sync writes the version files itself. No hand-edited version bumps remain.
- A release tag names a commit on the default branch, and that commit's `manifest.json` holds the tag's version.
- My vault updates a fork plugin when a newer fork release exists.

## Non-goals

- Non-fork repositories stay as they are.
- Upstream projects receive no changes.
- BRAT keeps its own user interface and its own repository list.
- pi-paster and pi-subagents stay on npm and git installs. I do not move them to BRAT.

## Anti-goals

- No git submodule. A submodule needs a gitlink commit in every fork to update.
- No copy of the sync job body in each fork.
- No `git tag -f` onto an arbitrary branch head.
- No `prerelease: true` on fork releases. BRAT drops such releases.
- No `v` prefix inside `manifest.json`, `package.json`, or `versions.json`.

## Constraints

- Obsidian reads `manifest.json` version as bare semver. npm reads `package.json` version as bare semver.
- BRAT reads GitHub releases only. It drops records with `prerelease: true`.
- BRAT orders releases by `semver.coerce(tag_name)` with `{ includePrerelease: true, loose: true }` (`src/utils/githubUtils.ts:604-630`). Those options keep a `-fork.N` suffix and drop a fourth numeric segment.
- BRAT decides an update with `compare(semver.coerce(local), semver.coerce(remote)) === -1` (`BetaPlugins.ts:569-582`).
- `pi-paster/.github/workflows/ci.yml` requires `tag == "v" + package.json version`.
- `pi-paster` runs `vp check` as a format gate. A committed workflow file must pass it.
- A reusable workflow cannot exceed the permissions of its caller. The caller declares `permissions`.
- A called workflow cannot hold a `schedule` trigger. The caller holds the cron.
- deadbeef upstream tags use a leading dot, for example `.06`. Raw `coerce` reads that as major `6`, so one custom step is needed.
- The vaults run BRAT `2.2.0` (2026-07-01), which matches BRAT `main` at the same line numbers. The audit holds for the installed version.

## Approaches

### Sharing the sync logic

**Reusable workflow in `fork-ops` (chosen).** `fork-ops` holds a `workflow_call` workflow. Each fork holds a small caller file with the cron, the manual trigger, the permissions, and the upstream name. A moving tag `v1` means one push in `fork-ops` updates all six.

- Gain: no duplication, no per-fork commit to update.
- Cost: callers must declare permissions, and the callee repository must be public.

**Git submodule.** Scripts live in a submodule.

- Gain: files sit in the working tree.
- Cost: `actions/checkout` needs `submodules: true`. Each update needs a gitlink commit in all six forks. A gitlink conflict is a new conflict class outside the version-file allowlist. This option gives the opposite of "update one, update all".

**npm package for the scripts.** The resolver scripts publish to npm with a version.

- Gain: versioned, testable, standard install.
- Cost: it removes only the script duplication. The job body stays in each fork. It fits as a supplement, not as the base.

Chosen: reusable workflow for job orchestration. The version scripts sit in `fork-ops` and the workflow calls them by path.

### Tag format

**Explicit `tag-format` input (chosen).** Each caller declares a template, for example `v{version}` for pi-paster.

- Gain: one visible line per fork. A wrong value fails at tag creation.
- Cost: six one-line edits.

**Detection from existing tags.** The workflow infers the prefix from recent tags.

- Cost: one hand-made tag sets the prefix for the whole fleet, with no error.

Chosen: explicit input, no automatic mode.

The version shape is the same in every fork: `<base>-fork.<N>`, where `<base>` is the upstream version with its patch number raised by one. Upstream `2.1.2` gives `2.1.3-fork.1`. Upstream `v0.26.3` gives `0.26.4-fork.1`. Upstream `v.06` gives `0.6.1-fork.1`. The tag prefix stays per repository, so `v0.26.4-fork.1` and `2.1.3-fork.1` both fit. The release name is the tag, character for character, so a tag and its release always look the same.

The patch bump is what makes semver work for us. A prerelease ranks below its release, so `2.1.2-fork.1` loses to a plain `2.1.2`. A base of `2.1.3` puts the fork release above every `2.1.2` and below every `2.1.4`.

### Release timing

**One workflow run does merge, version bump, push, tag, build, and publish (chosen).**

- Gain: one build. The tag and the published assets come from the same commit. No race between two runs.
- Cost: a long job. A build failure leaves the version commit on the branch without a release. A rerun then publishes it.

**Two workflows, one on push to `main`.** The sync pushes, then a release workflow runs on that push.

- Gain: small jobs.
- Cost: two builds, and a race with any other push. A hand push of an unrelated commit also triggers a release attempt.

Chosen: one run. The release job also stays available for the manual path. It exits early when the tag already exists, so a push of an unrelated commit releases nothing.

### BRAT tolerance

**Stock BRAT with a patch-bumped base (chosen).**

- Gain: nothing new to maintain. A fork release outranks its upstream base, and `-fork.N` orders numerically.
- Cost: a vault that holds an out-of-scheme version needs one reinstall by hand.

**Standalone plugin that drives BRAT's `betaPlugins` methods.**

- Gain: it performs the adoption update without a manual step.
- Cost: it depends on BRAT internals (`settings.pluginList`, `addPlugin` arguments), and a BRAT rewrite breaks it. The patch bump already fixes ordering, so the plugin would cover one reinstall per vault.

**Fork of BRAT with a patched comparator.**

- Gain: one plugin, fully correct ordering inside BRAT.
- Cost: a merge on every BRAT release, and every vault must migrate.

**Patch-free tag scheme, for example `0.26.301`.**

- Gain: stock BRAT works with no plugin.
- Cost: it loses the visible upstream base and abandons your `-fork.N` requirement.

Chosen: stock BRAT with the patch-bumped base. No plugin, and no BRAT fork.

**What stock BRAT does with fork tags (measured 2026-11-24).** Every `semverCoerce` call in BRAT passes `{ includePrerelease: true, loose: true }`: `BetaPlugins.ts:185,189,569,573,820,821` and `githubUtils.ts:607,611`. Three results follow.

- Fork-to-fork updates already work when the fork is the only publisher. A vault on `v0.26.2-fork.1` sees `v0.26.3-fork.1` as newer.
- A plain `x.y.z` release outranks `x.y.z-fork.N`, because semver ranks a prerelease below its release. The `obsidian-onedrive` release list is `2.1.2-fork.1`, `2.1.2`, `2.1.1`. BRAT sorts that list to `2.1.2`, `2.1.2-fork.1`, `2.1.1`, picks `2.1.2`, and finds it newer than an installed `2.1.2-fork.1`. It then replaces the fork build with the upstream build.
- An extra numeric segment is invisible. `2.1.2.1` is not valid semver, so `coerce` reads it as `2.1.2`. Stripping non-numeric content and comparing a fourth segment therefore changes nothing in stock BRAT.

**What the patch bump changes (measured 2026-11-24).** A fork release now sits one patch above its upstream base, so a plain upstream release can no longer outrank it. Semver orders `-fork.1` below `-fork.2`, and it reads a numeric suffix numerically, so `-fork.10` beats `-fork.9`. Measured with the options BRAT passes: `compare(coerce('0.1.3-fork.1'), coerce('0.1.3-fork.2'))` returns `-1`, which is the exact expression at `BetaPlugins.ts:569-582`. Stock BRAT therefore updates a vault from `-fork.1` to `-fork.2`, and from `-fork.2` to `-fork.10`. A four-segment tag such as `2.1.3.1` is unnecessary and stays out of scope.

**Two repairs are needed before a vault follows the scheme.**

- One legacy tag outranks the new scheme. `deadbeef-lyricbar` holds `v.06-fork.1`, which `coerce` reads as `6.0.0-fork.1`. That beats every `0.6.x-fork.N` tag, so the old tag must be replaced.
- A vault that holds a hand-bumped plain version above the new base sees no update. Both vaults hold `open-agent` at `0.1.5`, while the repaired scheme tops out at `0.1.3-fork.3`.

After those two repairs, stock BRAT ranks every fork release correctly. No plugin is needed. This is why the design drops the patch plugin and the BRAT fork.

## The how, as decided

### Repository layout of `fork-ops`

- `.github/workflows/sync-release.yml` holds the `workflow_call` job. One job serves the cron path and the manual path.
- `.github/scripts/fork-version.mjs` computes the next fork version and its `N`.
- `.github/scripts/resolve-version-conflicts.mjs` merges the version files after a conflicted merge. It moves from `obsidian-onedrive` unchanged in behaviour.
- `.github/scripts/normalize-tag.mjs` holds one tag parser. The workflow and the repair scripts use the same rules.
- `.github/scripts/write-version.mjs` writes one version into the files that each fork declares.
- `schema/fork-release.schema.json` documents the per-fork config file.
- `templates/upstream-sync.yml` holds the caller file to copy into a fork.
- `templates/fork-release.json` holds the config file to copy into a fork.
- `README.md` explains adoption and the version rules.

There is no `release.yml` in `fork-ops`. A `workflow_dispatch` job inside `fork-ops` cannot push a branch or a tag in a fork with the default token. Both triggers therefore live in the caller, and every write uses the caller's own token.

### Per-fork config file

A fork declares its own shape in `.github/fork-release.json`. The reusable workflow reads that file and takes no per-fork input.

```json
{
  "upstream": "tintinweb/pi-subagents",
  "tagFormat": "{version}",
  "versionFields": [
    { "path": "manifest.json", "field": "version" },
    { "path": "package.json", "field": "version" },
    { "path": "versions.json", "addEntry": true }
  ],
  "lockfile": "package-lock.json",
  "install": "npm ci",
  "test": "npx vitest run",
  "build": "npm run build",
  "pack": "",
  "assets": ["main.js", "manifest.json", "styles.css"],
  "nodeVersion": "20"
}
```

- `upstream`: owner and repository.
- `tagFormat`: a template with one `{version}` placeholder, for example `{version}` or `v{version}`. The version written into files never carries the prefix.
- `versionFields`: every file that holds a version, with a dotted field path. `addEntry` marks a file that maps version to a value instead of holding a `version` field.
- `lockfile`: `package-lock.json`, `pnpm-lock.yaml`, or `none`. This picks the refresh command.
- `install`, `test`, `build`, `pack`: shell commands, or empty to skip.
- `assets`: release files to attach, or an empty list.
- `nodeVersion`: setup-node value.

No fork in scope has a `manifest.json` except the two Obsidian plugins. `superpowers` holds its version in eleven files and ships `.version-bump.json` that lists them. Its `versionFields` copies that list. `deadbeef-lyricbar` is a C plugin with no version file, so its `versionFields` is empty and the tag alone carries the version.

### Inputs of `sync-release.yml`

- `tag`: optional. A manual value wins over the newest upstream release tag.
- No other input. Everything else comes from `.github/fork-release.json`.

### Steps of `sync-release.yml`

1. Read `.github/fork-release.json`. Stop with a clear message when the file is missing.
2. Resolve the target upstream tag. A manual `tag` input wins. Otherwise take the newest upstream release tag.
3. Stop when the upstream tag is already an ancestor of the fork branch and a release exists whose base is the bumped version of that tag. When the branch carries the merge but no such release, publish the version that the version files already hold. A rerun of a failed publish therefore completes the release, and nothing else duplicates.
4. Merge `refs/tags/<upstream-tag>` with `git merge --no-commit --no-ff`.
5. On a conflict, read the conflicted paths. Reject the run unless every path is a `versionFields` path or the lock file. Otherwise run `resolve-version-conflicts.mjs` and stage the result.
6. Compute the base version from the upstream tag with `normalize-tag.mjs`. That means one `coerce` call, then the patch number raised by one: upstream `2.1.2` gives `2.1.3`, and upstream `v.06` gives `0.6.1`.
7. Compute `N` as one plus the highest `N` already tagged for that base. The first fork release for a base is `N = 1`. When the version files already hold a `-fork.<N>` for the same base, the run is a fork-only release and `N` rises by one, so `0.1.3-fork.3` gives `0.1.3-fork.4`.
8. Write `<base>-fork.<N>` into every `versionFields` file. Add the `versions.json` entry mapped to the `minAppVersion` of the merged `manifest.json`.
9. Refresh the lock file through the manager that `lockfile` names: `npm install --package-lock-only`, `pnpm install --lockfile-only`, or nothing when the value is `none`.
10. Run `install`, `test`, `build`, then `pack`. A failure here stops the run with no commit and no tag, so a rerun repeats the whole path from step 4.
11. Commit the merge and the version bump as one commit, message `Sync <upstream-tag> and release <fork-version>`.
12. Create the tag from `tagFormat` on that commit. Push the commit and the tag.
13. Publish the release with the tag as name. Attach `assets`. When `pack` ran, attach the packed archive as well. Copy the upstream release body below a short header that records the merge commit.
14. On a conflict, or on an allowlist rejection at step 5, write `$RUNNER_TEMP/conflicts.txt` and open or comment on the issue `Upstream sync problem: <upstream-tag>`. A build failure opens no issue, because the run itself shows the failure.

### Rules the scripts enforce

- Version files never carry a tag prefix.
- The base is always the upstream version with its patch raised by one. A run never uses the upstream version as its own base.
- The new version compares greater than the highest existing tag of that fork. Equal or lower is an error, not a warning. The one-time repairs of `obsidian-openagent` and `deadbeef-lyricbar` are not syncs and bypass this rule.
- The tag inside a release names a commit on the default branch.
- The `manifest.json` inside the release assets holds the same version as the tag, without the prefix.
- Only a merge conflict or an allowlist rejection opens an issue.

### Caller file in each fork

The file holds the cron `17 7 * * *`, a manual trigger with an optional `tag` input, `permissions` with `contents: write` and `issues: write`, and one line: `uses: DecibillyJoel/fork-ops/.github/workflows/sync-release.yml@v1`. It holds fewer than twenty lines. It declares no secret, because the job never acts on another repository.

### Vault repair

Measured in both vaults on 2026-11-24. BRAT is `2.2.0`. Both vaults list `DecibillyJoel/obsidian-openagent` and `DecibillyJoel/obsidian-onedrive` in `pluginList`.

- `Fantasy Project` holds `onedrive-sync` at `2.1.1` and `open-agent` at `0.1.5`. Its `pluginSubListFrozenVersion` is empty.
- `Fantasy Thing` holds `open-agent` at `0.1.5`. It has no `onedrive-sync` folder. Its `pluginSubListFrozenVersion` holds two entries, both with `version: "latest"`: one for each repository. A frozen entry stops BRAT from updating that repository.
- No token sits in the BRAT data file. Both vaults use the SecretStorage name `github-pat`.

One reinstall covers `open-agent`, because `0.1.5` ranks above `0.1.3-fork.3`. After that reinstall, stock BRAT finds `0.1.3-fork.4` and any later release on its own.

1. Thaw both frozen entries in `Fantasy Thing`, so the two repositories follow the newest release.
2. Reinstall `obsidian-openagent` once in each vault from the BRAT menu, with the tag `0.1.3-fork.3` pinned.
3. Let `obsidian-onedrive` update on its own. `2.1.1` to `2.1.3-fork.1` is an ordinary forward update.

### Version comparison, one rule for both consumers

The rule is semver, plus one custom step. Stock BRAT already applies it, so the workflow and every repair script use the same two calls.

1. Strip a leading `v` or `V`.
2. Put a `0` in front of a leading `.`, so `v.06` becomes `0.06`.
3. Pass the result to `semver.coerce` with `{ includePrerelease: true, loose: true }`, the options BRAT passes.
4. Compare with `semver.compare`.

Step 2 is needed, and step 3 covers everything else. Measured on npm `semver` 7.x: `coerce('.06')`, `coerce('v.06')`, and `coerce('06')` return `6.0.0`, because `coerce` reads `.06` as major `6`. `coerce('0.06')` returns `0.6.0`. One prefixed zero gives the right answer, and no other case needs a custom rule. `normalize-tag.mjs` owns this rule, and the workflow and the repair scripts follow it.

Measured results on the same library:

| input | after steps 1 and 2 | `coerce` |
|---|---|---|
| `2.1.2-fork.1` | `2.1.2-fork.1` | `2.1.2-fork.1` |
| `v0.26.3-fork.1` | `0.26.3-fork.1` | `0.26.3-fork.1` |
| `v.06` | `0.06` | `0.6.0` |
| `v0.4` | `0.4` | `0.4.0` |
| `2.1.2.1` | `2.1.2.1` | `2.1.2` |

Consequences, all measured with `compare`:

- `0.1.3-fork.2` is newer than `0.1.3-fork.1`, and `0.1.3-fork.10` is newer than `0.1.3-fork.9`.
- `2.1.3-fork.1` is newer than `2.1.2`. The patch bump gives this, and semver gives the rest.
- `0.1.3-fork.3` is newer than `0.1.2`.
- A fourth numeric segment is dropped, so no fork tag may carry one. The repair scripts refuse to create one.

### obsidian-openagent repair

The fork holds four plain releases: `0.1.2`, `0.1.3`, `0.1.4`, and `0.1.5` (published 2026-11-24). Upstream's newest tag is `0.1.2`, so the base for a fork release is `0.1.3`.

Target mapping: `0.1.3` to `0.1.3-fork.1`, `0.1.4` to `0.1.3-fork.2`, `0.1.5` to `0.1.3-fork.3`. The plain `0.1.2` release stays as it is. It is the upstream build, and `0.1.3-fork.1` ranks above it, so it can never outrank a fork release.

The repair reuses the published assets. It does not rebuild old commits.

1. Download `main.js` and `styles.css` from each old release.
2. Rewrite only `manifest.json`, with the version set to the new fork version. The compiled `main.js` holds no version, so the old bytes stay valid.
3. Create the new tag on the same commit the old tag points at. That commit is on the default branch history, so the tag rule holds.
4. Publish the release under the new tag with the reused assets and the original release body.
5. Delete the old tag and the old release after the new release exists.
6. Make one commit on the default branch that sets `manifest.json` and `package.json` to `0.1.3-fork.3` and adds the three `versions.json` entries, because Obsidian reads `versions.json` from the default branch.

### pi-paster repair

Measured on 2026-11-24.

- `main` holds `feat/linux-clipboard-image-support` in full, and is ahead of it by six commits. The branch needs no merge, only a switch.
- The `CI` run on `f8d59e2` failed at the `Check` step. `vp check` runs `oxfmt`, and `oxfmt` wants double quotes in `.github/workflows/upstream-sync.yml`. The failure covers three lines: `'17 7 * * *'`, `'Upstream release tag to merge (blank = latest release)'`, and `''`.
- `vp check --fix` rewrites those three lines. `vp check`, `vp test run` (70 tests in 9 files), and `npm run build` all pass afterwards. The rest of the pipeline never failed, it never ran.

1. Commit the three-line format fix to `main`, and let `CI` go green. Done: commit `c2c8b9c`, and `CI` run `45499468354` finished green.
2. Move `~/.pi/agent/settings.json` from `@feat/linux-clipboard-image-support` to the default branch. Done.
3. Remove the `release` job from `ci.yml`. The reusable workflow publishes from now on.
4. Keep `ci.yml` as the build and test gate.
5. Every file that `fork-ops` writes into `pi-paster` must pass `oxfmt`, so the caller template uses double quotes.

### deadbeef-lyricbar repair

The fork holds one release, tagged `v.06-fork.1`, with no assets. Upstream tags are `v.06`, `v.05`, `v0.4`, `v0.3`, `v0.2`, and `v0.1`. `coerce` reads the old fork tag as `6.0.0-fork.1`, which outranks every `0.6.x-fork.N` tag, so the rename is required, not cosmetic. Upstream `v.06` normalizes to `0.6.0`, the patch bump gives `0.6.1`, and `tagFormat` is `v{version}`.

1. Create the tag `v0.6.1-fork.1` on the commit that `v.06-fork.1` points at.
2. Publish the release under the new tag with the old body and no assets.
3. Delete the tag and the release `v.06-fork.1`.

The next sync of a newer upstream tag computes a fresh base, so no version repeats. A fork-only release on base `0.6.1` computes `N = 2`.

### Adoption order

1. `obsidian-onedrive`, because its scripts and release flow are the source.
2. `obsidian-openagent`, with the repair above.
3. `pi-subagents`, then `deadbeef-lyricbar`, then `superpowers`.
4. `pi-paster`, last, because of the format gate.
5. The vault repair: thaw `Fantasy Thing`, then reinstall `obsidian-openagent` once per vault, after the repaired releases exist.

## Calls I made

- `fork-ops` is public, because a cross-repository `uses:` needs it. It publishes a moving tag `v1`. A fork may pin a SHA instead.
- A per-fork `.github/fork-release.json` replaces six sets of inputs. A fork states its own version files, lock manager, commands, and assets once.
- `fork-ops` holds no release job. Both triggers live in the caller, so every write uses the caller's token and no secret is passed across repositories.
- Build, test, and pack run before the commit and the tag. A build failure leaves no commit and no tag, so a rerun is always safe.
- The run exits early only when both the tag and the release exist. A present tag with a missing release completes the release.
- The `obsidian-openagent` repair reuses the published `main.js` and `styles.css` and rewrites only the manifest. No old commit is rebuilt.
- `versions.json` gets one entry per fork release.
- The lock file comes from the manager that `lockfile` names, not from text editing.
- No plugin and no BRAT fork. The patch bump makes stock BRAT order every fork release correctly, and one reinstall per vault covers the out-of-scheme versions.
- No tag ever reaches `semver.coerce` unchanged. Every tag gets one custom step first: a `0` in front of a leading `.`. Raw `coerce('.06')` returns `6.0.0`, which would break every later update of `deadbeef-lyricbar`. `coerce('0.06')` returns `0.6.0`.
- The fork base is always the upstream version with its patch raised by one. A plain upstream release can then never outrank its fork release, and `-fork.<N>` orders correctly on its own. `deadbeef-lyricbar` adopts the tag prefix `v`, so its first uniform tag is `v0.6.1-fork.1`, and the old `v.06-fork.1` must be replaced because `coerce` ranks it as `6.0.0-fork.1`.
- The conflict issue title changes from `Upstream sync conflict: <tag>` to `Upstream sync problem: <tag>`, because the job now covers more than a merge.

## What is left to the builder

- The exact field names of `.github/fork-release.json`, fixed once the schema is written.
- Whether the scripts get a small test harness inside `fork-ops`.
- The order of the tag deletions for `obsidian-openagent` and for `deadbeef-lyricbar`.
- Whether `deadbeef-lyricbar` builds in CI. Upstream ships `ddb_lyricbar_gtk3.so` and `deadbeef-lyricbar.mo`. Until a build works, that fork keeps `build: ""` and `assets: []`.
- The BRAT menu steps for the one pinned reinstall, written down for the user.
