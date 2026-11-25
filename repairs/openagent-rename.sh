#!/usr/bin/env bash
# Rename one plain obsidian-openagent release to the fork tag shape.
#
# Usage: openagent-rename.sh <old-tag> <new-version>
#
# The new tag equals the new version, because the fork uses tagFormat {version}.
# The script reuses the published assets, rewrites only manifest.json, creates
# the tag on the same commit, publishes the release, and only then removes the
# old release and the old tag.
set -euo pipefail

REPO="${REPO:-DecibillyJoel/obsidian-openagent}"
CLONE="${CLONE:-$HOME/Projects/GitHub/obsidian-openagent}"
API="https://api.github.com/repos/$REPO"
UPLOADS="https://uploads.github.com/repos/$REPO"
FORK_TAG_PATTERN='^[0-9]+\.[0-9]+\.[0-9]+-fork\.[0-9]+$'
ASSETS=(main.js manifest.json styles.css)

die() { echo "error: $*" >&2; exit 1; }
say() { echo "==> $*"; }

[ $# -eq 2 ] || die "usage: $0 <old-tag> <new-version>"
OLD_TAG="$1"
NEW_VERSION="$2"
NEW_TAG="$NEW_VERSION"

: "${GITHUB_PERSONAL_ACCESS_TOKEN:?GITHUB_PERSONAL_ACCESS_TOKEN is not set}"
for tool in curl git node; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required"
done
[ -d "$CLONE/.git" ] || die "no git clone at $CLONE"
[[ "$NEW_TAG" =~ $FORK_TAG_PATTERN ]] || die "new tag $NEW_TAG is not <base>-fork.<N> with three numeric segments"
[ "$OLD_TAG" != "$NEW_TAG" ] || die "old tag and new tag are the same"

AUTH=(-H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN")
JSON_AUTH=("${AUTH[@]}" -H "Accept: application/vnd.github+json")
RAW_AUTH=("${AUTH[@]}" -H "Accept: application/octet-stream")

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# GET <path> <outfile> -> http status on stdout
get_to() {
  curl -sS -o "$2" -w '%{http_code}' "${JSON_AUTH[@]}" "$API$1"
}

# SEND <method> <path> <bodyfile|""> <outfile> -> http status on stdout
send() {
  local method="$1" path="$2" body="$3" out="$4"
  if [ -n "$body" ]; then
    curl -sS -X "$method" -o "$out" -w '%{http_code}' "${JSON_AUTH[@]}" \
      -H "Content-Type: application/json" --data-binary "@$body" "$API$path"
  else
    curl -sS -X "$method" -o "$out" -w '%{http_code}' "${JSON_AUTH[@]}" "$API$path"
  fi
}

# json <file> <javascript expression over `d`>
json() {
  node -e '
    const fs = require("node:fs");
    const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const out = (() => { return eval(process.argv[2]); })();
    process.stdout.write(String(out));
  ' "$1" "$2"
}

say "read the old release $OLD_TAG"
status="$(get_to "/releases/tags/$OLD_TAG" "$WORK/old.json")"
[ "$status" = "200" ] || die "cannot read release $OLD_TAG (HTTP $status)"
OLD_ID="$(json "$WORK/old.json" 'd.id')"
OLD_BODY_CHECK="$(json "$WORK/old.json" 'typeof d.body === "string" ? "yes" : "no"')"
[ "$OLD_BODY_CHECK" = "yes" ] || die "release $OLD_TAG has no body field"

node -e '
  const fs = require("node:fs");
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const names = process.argv.slice(2);
  const lines = [];
  for (const name of names) {
    const asset = data.assets.find((a) => a.name === name);
    if (!asset) {
      console.error(`release ${data.tag_name} has no ${name} asset`);
      process.exit(3);
    }
    lines.push(`${name} ${asset.id} ${asset.size}`);
  }
  fs.writeFileSync(process.argv[1] + ".assets", lines.join("\n") + "\n");
' "$WORK/old.json" "${ASSETS[@]}" || die "release $OLD_TAG is missing a required asset"
mv "$WORK/old.json.assets" "$WORK/assets.txt"
while read -r name asset_id asset_size; do
  say "download $name (asset $asset_id, $asset_size bytes)"
  curl -sSL -f "${RAW_AUTH[@]}" -o "$WORK/$name" "$API/releases/assets/$asset_id" \
    || die "cannot download $name"
  got_size="$(wc -c < "$WORK/$name")"
  [ "$got_size" = "$asset_size" ] || die "$name is $got_size bytes, the API says $asset_size"
done < "$WORK/assets.txt"

say "check that $NEW_TAG is free"
status="$(curl -sS -o /dev/null -w '%{http_code}' "${JSON_AUTH[@]}" "$API/git/ref/tags/$NEW_TAG")"
[ "$status" = "404" ] || die "tag $NEW_TAG already exists (HTTP $status)"
status="$(curl -sS -o /dev/null -w '%{http_code}' "${JSON_AUTH[@]}" "$API/releases/tags/$NEW_TAG")"
[ "$status" = "404" ] || die "release $NEW_TAG already exists (HTTP $status)"

say "resolve the commit of $OLD_TAG"
git -C "$CLONE" fetch --tags origin >/dev/null 2>&1 || die "git fetch --tags origin failed in $CLONE"
LOCAL_SHA="$(git -C "$CLONE" rev-parse "$OLD_TAG^{commit}" 2>/dev/null)" || die "local tag $OLD_TAG does not exist"
status="$(get_to "/git/ref/tags/$OLD_TAG" "$WORK/ref.json")"
[ "$status" = "200" ] || die "cannot read tag $OLD_TAG (HTTP $status)"
API_SHA="$(json "$WORK/ref.json" 'd.object.type === "tag" ? "" : d.object.sha')"
if [ -z "$API_SHA" ]; then
  TAG_OBJ="$(json "$WORK/ref.json" 'd.object.sha')"
  status="$(get_to "/git/tags/$TAG_OBJ" "$WORK/tagobj.json")"
  [ "$status" = "200" ] || die "cannot dereference annotated tag $OLD_TAG (HTTP $status)"
  API_SHA="$(json "$WORK/tagobj.json" 'd.object.sha')"
fi
[ "$LOCAL_SHA" = "$API_SHA" ] || die "local $OLD_TAG is $LOCAL_SHA but the API says $API_SHA"
COMMIT_SHA="$API_SHA"
say "commit is $COMMIT_SHA"

say "rewrite the version in manifest.json to $NEW_VERSION"
OLD_MANIFEST_VERSION="$(json "$WORK/manifest.json" 'd.version')"
say "manifest.json held $OLD_MANIFEST_VERSION"
node -e '
  const fs = require("node:fs");
  const [file, version] = process.argv.slice(1);
  const text = fs.readFileSync(file, "utf8");
  const data = JSON.parse(text);
  data.version = version;
  const out = JSON.stringify(data, null, 2) + (text.endsWith("\n") ? "\n" : "");
  fs.writeFileSync(file, out);
' "$WORK/manifest.json" "$NEW_VERSION"
[ "$(json "$WORK/manifest.json" 'd.version')" = "$NEW_VERSION" ] || die "manifest.json rewrite failed"

say "create the tag $NEW_TAG on $COMMIT_SHA"
node -e '
  const fs = require("node:fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({ ref: `refs/tags/${process.argv[2]}`, sha: process.argv[3] }));
' "$WORK/ref-create.json" "$NEW_TAG" "$COMMIT_SHA"
status="$(send POST "/git/refs" "$WORK/ref-create.json" "$WORK/ref-created.json")"
[ "$status" = "201" ] || die "cannot create tag $NEW_TAG (HTTP $status): $(cat "$WORK/ref-created.json")"

say "create the release $NEW_TAG"
node -e '
  const fs = require("node:fs");
  const old = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  fs.writeFileSync(process.argv[2], JSON.stringify({
    tag_name: process.argv[3],
    name: process.argv[3],
    body: old.body,
    target_commitish: process.argv[4],
    draft: false,
    prerelease: false,
  }));
' "$WORK/old.json" "$WORK/release-create.json" "$NEW_TAG" "$COMMIT_SHA"
status="$(send POST "/releases" "$WORK/release-create.json" "$WORK/release-created.json")"
[ "$status" = "201" ] || die "cannot create release $NEW_TAG (HTTP $status): $(cat "$WORK/release-created.json")"
NEW_ID="$(json "$WORK/release-created.json" 'd.id')"
say "new release id is $NEW_ID"

for name in "${ASSETS[@]}"; do
  case "$name" in
    *.js) type="text/javascript" ;;
    *.json) type="application/json" ;;
    *.css) type="text/css" ;;
    *) type="application/octet-stream" ;;
  esac
  say "upload $name"
  status="$(curl -sS -X POST -o "$WORK/upload.json" -w '%{http_code}' "${JSON_AUTH[@]}" \
    -H "Content-Type: $type" --data-binary "@$WORK/$name" \
    "$UPLOADS/releases/$NEW_ID/assets?name=$name")"
  [ "$status" = "201" ] || die "cannot upload $name (HTTP $status): $(cat "$WORK/upload.json")"
  [ "$(json "$WORK/upload.json" 'd.state')" = "uploaded" ] || die "$name did not finish uploading"
done

say "verify the new release"
status="$(get_to "/releases/$NEW_ID" "$WORK/release-final.json")"
[ "$status" = "200" ] || die "cannot read release $NEW_ID (HTTP $status)"
COUNT="$(node -e '
  const fs = require("node:fs");
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const names = new Set(process.argv.slice(2));
  process.stdout.write(String(data.assets.filter((a) => names.has(a.name)).length));
' "$WORK/release-final.json" "${ASSETS[@]}")"
[ "$COUNT" = "3" ] || die "release $NEW_TAG holds $COUNT of 3 assets, the old release is untouched"
NAME_CHECK="$(json "$WORK/release-final.json" 'd.name')"
[ "$NAME_CHECK" = "$NEW_TAG" ] || die "release name is $NAME_CHECK, not $NEW_TAG"

say "delete the old release $OLD_ID"
status="$(send DELETE "/releases/$OLD_ID" "" "$WORK/delete-release.json")"
[ "$status" = "204" ] || die "cannot delete release $OLD_ID (HTTP $status)"

say "delete the old tag $OLD_TAG"
status="$(curl -sS -X DELETE -o "$WORK/delete-tag.json" -w '%{http_code}' "${JSON_AUTH[@]}" "$API/git/refs/tags/$OLD_TAG")"
[ "$status" = "204" ] || die "cannot delete tag $OLD_TAG (HTTP $status)"

echo "$NEW_TAG"
echo "assets: $COUNT"
