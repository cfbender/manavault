#!/usr/bin/env python3
"""Turn `mix ecto.migrate --log-migrations-sql` output into one SQL file per Ecto migration.

    python3 rust/scripts/dump-migrations.py migrate.log rust/migrations

The Rust server applies these files to databases that are missing Ecto migrations, recording
each version in `schema_migrations` exactly as Ecto does (`db::migrate`). Only the SQL a
migration runs unconditionally is kept: DDL and raw `execute` statements. Statements Ecto
built from Elixir values (logged with a non-empty parameter list, such as `insert_all` or
`update_all`) and reads (SELECT) are dropped, because their effect depends on the data being
migrated; each such migration is ported to Rust as a `data_step` in `db::migrate`, and
`DATA_STEP_VERSIONS` below must list exactly those migrations (the script fails otherwise).
"""
import re
import sys
from pathlib import Path

# Migrations whose Elixir code reads or writes data; ported in `db::migrate::data_step`.
DATA_STEP_VERSIONS = {
    "20260708000002",  # CreateDefaultDeckTags: seeds the four starter tags
    "20260708000003",  # BackfillDeckDefaultTags
    "20260802120000",  # MergeDeckZonesIntoConsidering
    "20260808000000",  # AddNormalizedCardNames
    "20260809000000",  # DeleteCardsWithoutPrintings
    "20260815000000",  # AddNormalizedFlavorNames
    "20261005000000",  # DeallocateConsideringDeckCards
}


def split_params(sql: str) -> tuple[str, str]:
    """Split `SQL [params]` into the SQL and the (bracket-balanced) parameter list."""
    sql = sql.rstrip()
    if not sql.endswith("]"):
        return sql, ""
    depth = 0
    for index in range(len(sql) - 1, -1, -1):
        char = sql[index]
        if char == "]":
            depth += 1
        elif char == "[":
            depth -= 1
            if depth == 0:
                return sql[:index].rstrip(), sql[index:]
    return sql, ""


def main() -> int:
    log = Path(sys.argv[1]).read_text()
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.sql"):
        old.unlink()

    running = re.compile(r"== Running (\d+) Manavault\.Repo\.Migrations\.(\w+)\.")
    blocks = re.split(r"\n(?=\d\d:\d\d:\d\d\.\d+ \[)", log)
    current = None
    statements: dict[str, list[str]] = {}
    names: dict[str, str] = {}
    dropped: dict[str, list[str]] = {}
    for block in blocks:
        match = running.search(block)
        if match:
            current = match.group(1)
            names[current] = re.sub(r"(?<!^)(?=[A-Z])", "_", match.group(2)).lower()
            statements[current] = []
            continue
        if "QUERY ERROR" in block:
            print(f"migration {current} logged a failed query", file=sys.stderr)
            return 1
        if current is None or "QUERY OK" not in block:
            continue
        sql, params = split_params(block.split("\n", 1)[1])
        sql = sql.strip()
        if not sql or "schema_migrations" in sql:
            continue
        if sql.upper().startswith("SELECT") or params not in ("", "[]"):
            dropped.setdefault(current, []).append(sql)
            continue
        statements[current].append(sql)

    unported = set(dropped) - DATA_STEP_VERSIONS
    if unported:
        for version in sorted(unported):
            print(f"migration {version} reads or writes data; port it as a data_step:", file=sys.stderr)
            for sql in dropped[version]:
                print(f"  {sql[:160]}", file=sys.stderr)
        return 1

    for version, sqls in statements.items():
        body = "".join(f"{sql};\n\n" for sql in sqls)
        note = (
            "-- Data step: the Elixir code of this migration is ported to db::migrate::data_step.\n\n"
            if version in DATA_STEP_VERSIONS
            else ""
        )
        (out / f"{version}_{names[version]}.sql").write_text(
            f"-- Generated from priv/repo/migrations/{version}_*.exs "
            "by rust/scripts/dump-migrations.py.\n\n" + note + body
        )
    print(f"wrote {len(statements)} migrations to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
