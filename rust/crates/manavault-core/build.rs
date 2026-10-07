//! Embeds `rust/migrations/*.sql` (one file per migration) as `MIGRATIONS`.

use std::fmt::Write as _;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations");
    println!("cargo::rerun-if-changed={}", dir.display());
    let mut files: Vec<_> = std::fs::read_dir(&dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "sql"))
        .collect();
    files.sort();

    let mut out = String::from(
        "/// Every migration as `(version, name, sql)`, oldest first.\npub const MIGRATIONS: &[(i64, &str, &str)] = &[\n",
    );
    for path in files {
        let stem = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or("bad migration file name")?;
        let (version, name) = stem
            .split_once('_')
            .ok_or("migration file names must be <version>_<name>.sql")?;
        let version: i64 = version.parse()?;
        writeln!(
            out,
            "    ({version}, {name:?}, include_str!({:?})),",
            path.display()
        )?;
    }
    out.push_str("];\n");
    let target = Path::new(&std::env::var("OUT_DIR")?).join("migrations.rs");
    std::fs::write(target, out)?;
    Ok(())
}
