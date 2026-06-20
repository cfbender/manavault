#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat >&2 <<'EOF'
Usage: mise run release -- major|minor|patch

Increments mix.exs version, updates README Docker tag examples, commits the
release files, creates an annotated tag, then pushes the current branch and tag
to origin.

Set MANAVAULT_RELEASE_DRY_RUN=1 to print the planned version without editing,
committing, tagging, or pushing.
EOF
}

if [[ $# -ne 1 ]]; then
	usage
	exit 2
fi

part=$1
case "$part" in
major | minor | patch) ;;
*)
	usage
	exit 2
	;;
esac

version_file="mix.exs"
readme_file="README.md"
current=$(perl -ne 'print "$1\n" if /^\s*version:\s*"([0-9]+\.[0-9]+\.[0-9]+)",/' "$version_file")

if [[ -z "$current" ]]; then
	printf 'Could not find semver project version in %s\n' "$version_file" >&2
	exit 1
fi

previous_tag=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)
previous_version="${previous_tag#v}"

semver_gt() {
	local left=$1 right=$2
	local left_major left_minor left_patch right_major right_minor right_patch

	IFS=. read -r left_major left_minor left_patch <<<"$left"
	IFS=. read -r right_major right_minor right_patch <<<"$right"

	if ((left_major != right_major)); then
		((left_major > right_major))
	elif ((left_minor != right_minor)); then
		((left_minor > right_minor))
	else
		((left_patch > right_patch))
	fi
}

if [[ -n "$previous_tag" ]] && semver_gt "$current" "$previous_version"; then
	next="$current"
else
	IFS=. read -r major minor patch <<<"$current"
	case "$part" in
	major)
		major=$((major + 1))
		minor=0
		patch=0
		;;
	minor)
		minor=$((minor + 1))
		patch=0
		;;
	patch)
		patch=$((patch + 1))
		;;
	esac
	next="$major.$minor.$patch"
fi

tag="v$next"
current_minor="${current%.*}"
next_minor="${next%.*}"

if [[ "${MANAVAULT_RELEASE_DRY_RUN:-}" == "1" ]]; then
	printf '%s -> %s (%s)\n' "$current" "$next" "$tag"
	exit 0
fi

dirty_paths=$( { git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard; } | sort -u | grep -v '^CHANGELOG\.md$' || true )
if [[ -n "$dirty_paths" ]]; then
	printf 'Working tree has uncommitted changes outside CHANGELOG.md. Commit or stash them before releasing:\n%s\n' "$dirty_paths" >&2
	exit 1
fi

branch=$(git branch --show-current)
if [[ -z "$branch" ]]; then
	printf 'Cannot release from a detached HEAD.\n' >&2
	exit 1
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
	printf 'Tag %s already exists locally.\n' "$tag" >&2
	exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
	printf 'Tag %s already exists on origin.\n' "$tag" >&2
	exit 1
fi

if [[ "$current" != "$next" ]]; then
	CURRENT="$current" NEXT="$next" perl -0pi -e 's/version:\s*"\Q$ENV{CURRENT}\E"/version: "$ENV{NEXT}"/' "$version_file"
fi

if [[ -f "$readme_file" ]] && [[ "$current" != "$next" ]]; then
	CURRENT="$current" \
	NEXT="$next" \
	CURRENT_MINOR="$current_minor" \
	NEXT_MINOR="$next_minor" \
		perl -0pi -e '
			s#ghcr\.io/cfbender/manavault:\Q$ENV{CURRENT}\E#ghcr.io/cfbender/manavault:$ENV{NEXT}#g;
			s/`\Q$ENV{CURRENT}\E` and `\Q$ENV{CURRENT_MINOR}\E` from tag `v\Q$ENV{CURRENT}\E`/`$ENV{NEXT}` and `$ENV{NEXT_MINOR}` from tag `v$ENV{NEXT}`/g;
			s/`v\Q$ENV{CURRENT}\E` from the raw tag ref/`v$ENV{NEXT}` from the raw tag ref/g;
		' "$readme_file"
fi

git add "$version_file" CHANGELOG.md
if [[ -f "$readme_file" ]]; then
	git add "$readme_file"
fi

git commit -m "chore: release $tag"
git tag -a "$tag" -m "Release $tag"
git push origin "$branch"
git push origin "$tag"

printf 'Released %s on %s.\n' "$tag" "$branch"
