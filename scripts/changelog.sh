#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat >&2 <<'EOF'
Usage: mise run changelog -- major|minor|patch

Generates CHANGELOG.md with git-cliff for the next major/minor/patch version.
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

if [[ -n "$previous_tag" ]]; then
	range="$previous_tag..HEAD"
else
	range="HEAD"
fi

if [[ "${MANAVAULT_RELEASE_DRY_RUN:-}" == "1" ]]; then
	printf 'Would generate CHANGELOG.md for %s from %s\n' "$tag" "$range"
	exit 0
fi

if [[ -f CHANGELOG.md ]] && grep -q "^## \\[$next\\]" CHANGELOG.md; then
	git-cliff "$range" --tag "$tag" --output CHANGELOG.md
elif [[ -f CHANGELOG.md ]]; then
	git-cliff "$range" --tag "$tag" --prepend CHANGELOG.md
else
	git-cliff "$range" --tag "$tag" --output CHANGELOG.md
fi
