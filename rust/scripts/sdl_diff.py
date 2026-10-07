#!/usr/bin/env python3
"""Compare two GraphQL SDL files structurally.

Ignores descriptions, ordering, and formatting; reports types and fields that
are missing, extra, or typed differently. Exit status 1 when they differ.

    python3 rust/scripts/sdl_diff.py expected.graphql actual.graphql
"""
import re
import sys


def strip(sdl):
    sdl = re.sub(r'"""[\s\S]*?"""', "", sdl)
    sdl = re.sub(r'"(?:[^"\\\n]|\\.)*"', "", sdl)
    sdl = re.sub(r"#[^\n]*", "", sdl)
    sdl = re.sub(r"@\w+(\([^)]*\))?", "", sdl)
    return sdl


def parse(sdl):
    types = {}
    for match in re.finditer(r"\b(type|input|interface|enum|scalar|union|schema)\s+(\w*)([^{}=]*)(\{([^{}]*)\}|=[^\n]*)?", strip(sdl)):
        kind, name, header, _, body = match.groups()
        if kind == "schema":
            continue
        implements = tuple(sorted(re.findall(r"\w+", header.replace("implements", ""))))
        fields = {}
        if body:
            body = re.sub(r"\s+", " ", body)
            if kind == "enum":
                for value in body.split():
                    fields[value] = ""
            else:
                for field in re.finditer(r"(\w+)\s*(\(([^)]*)\))?\s*:\s*([\w\[\]!]+)(\s*=\s*[^ ]+)?", body):
                    fname, _, args, ftype, default = field.groups()
                    arglist = []
                    if args:
                        for arg in re.finditer(r"(\w+)\s*:\s*([\w\[\]!]+)(\s*=\s*(\[[^\]]*\]|\{[^}]*\}|[^,\s)]+))?", args):
                            arglist.append(f"{arg.group(1)}: {arg.group(2)}" + (f" = {arg.group(4)}" if arg.group(4) else ""))
                    fields[fname] = f"({', '.join(sorted(arglist))}) -> {ftype}" if arglist else ftype
        types[f"{kind} {name}"] = (implements, fields)
    return types


def main():
    expected = parse(open(sys.argv[1]).read())
    actual = parse(open(sys.argv[2]).read())
    problems = []
    for key in sorted(set(expected) | set(actual)):
        if key not in actual:
            problems.append(f"missing {key}")
            continue
        if key not in expected:
            problems.append(f"extra   {key}")
            continue
        (e_impl, e_fields), (a_impl, a_fields) = expected[key], actual[key]
        if e_impl != a_impl:
            problems.append(f"{key}: implements {e_impl} != {a_impl}")
        for field in sorted(set(e_fields) | set(a_fields)):
            if field not in a_fields:
                problems.append(f"{key}.{field}: missing ({e_fields[field]})")
            elif field not in e_fields:
                problems.append(f"{key}.{field}: extra ({a_fields[field]})")
            elif e_fields[field] != a_fields[field]:
                problems.append(f"{key}.{field}: expected {e_fields[field]}, got {a_fields[field]}")
    for problem in problems:
        print(problem)
    print(f"{len(problems)} differences", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
