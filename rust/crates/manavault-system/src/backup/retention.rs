//! Keeping the newest cloud backups (`Manavault.Backup.Retention`).

use std::future::Future;

use super::Remote;

fn sort_key(remote: &Remote) -> i128 {
    remote
        .modified_at
        .as_deref()
        .and_then(crate::timefmt::parse)
        .map_or(-1, |at| at.unix_timestamp_nanos() / 1000)
}

/// Deletes all but the newest `count` backups (the just-uploaded one
/// included). Errors are collected; backups deleted before a failure are
/// reported in the message.
pub async fn prune<F, Fut>(
    count: Option<i64>,
    uploaded: &Remote,
    backups: Vec<Remote>,
    delete: F,
) -> Result<Vec<Remote>, String>
where
    F: Fn(Remote) -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
    let Some(count) = count else {
        return Ok(Vec::new());
    };
    let mut all = backups;
    if !all.iter().any(|backup| backup.id == uploaded.id) {
        all.insert(0, uploaded.clone());
    }
    // Stable, newest first.
    all.sort_by_key(|backup| std::cmp::Reverse(sort_key(backup)));
    let keep = usize::try_from(count).unwrap_or(0);
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    for backup in all.into_iter().skip(keep) {
        match delete(backup.clone()).await {
            Ok(()) => deleted.push(backup),
            Err(reason) => errors.push(format!("{}: {reason}", backup.name)),
        }
    }
    if errors.is_empty() {
        return Ok(deleted);
    }
    let error_count = errors.len();
    let deleted_count = deleted.len();
    Err(format!(
        "failed to prune {error_count} old cloud {}: {}. {deleted_count} old cloud {} deleted before the failure.",
        if error_count == 1 {
            "backup"
        } else {
            "backups"
        },
        errors.join("; "),
        if deleted_count == 1 {
            "backup was"
        } else {
            "backups were"
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn backup(name: &str, modified_at: &str) -> Remote {
        Remote {
            id: name.into(),
            name: name.into(),
            provider: "s3".into(),
            size: Some(1),
            modified_at: Some(modified_at.into()),
        }
    }

    #[tokio::test]
    async fn keeps_the_newest_backups_within_the_count() {
        let deleted_ids = Mutex::new(Vec::new());
        let deleted = prune(
            Some(2),
            &backup("new.zip", "2026-06-27T03:00:00Z"),
            vec![
                backup("middle.zip", "2026-06-26T03:00:00Z"),
                backup("old.zip", "2026-06-25T03:00:00Z"),
            ],
            |remote| {
                deleted_ids.lock().unwrap().push(remote.id);
                async { Ok(()) }
            },
        )
        .await
        .unwrap();
        assert_eq!(deleted.len(), 1);
        assert_eq!(deleted[0].name, "old.zip");
        assert_eq!(*deleted_ids.lock().unwrap(), vec!["old.zip".to_owned()]);
    }

    #[tokio::test]
    async fn keeps_everything_without_a_count() {
        let deleted = prune(
            None,
            &backup("new.zip", "2026-06-27T03:00:00Z"),
            vec![backup("old.zip", "2026-06-25T03:00:00Z")],
            |_| async { Err::<(), String>("should not delete".into()) },
        )
        .await
        .unwrap();
        assert_eq!(deleted, Vec::<Remote>::new());
    }

    #[tokio::test]
    async fn reports_failures_without_hiding_deleted_backups() {
        let deleted_ids = Mutex::new(Vec::new());
        let message = prune(
            Some(1),
            &backup("new.zip", "2026-06-27T03:00:00Z"),
            vec![
                backup("middle.zip", "2026-06-26T03:00:00Z"),
                backup("old.zip", "2026-06-25T03:00:00Z"),
            ],
            |remote| {
                let result = if remote.id == "middle.zip" {
                    Err("permission denied".to_owned())
                } else {
                    deleted_ids.lock().unwrap().push(remote.id);
                    Ok(())
                };
                async move { result }
            },
        )
        .await
        .unwrap_err();
        assert!(
            message.contains("failed to prune 1 old cloud backup: middle.zip: permission denied")
        );
        assert!(message.contains("1 old cloud backup was deleted before the failure"));
        assert_eq!(*deleted_ids.lock().unwrap(), vec!["old.zip".to_owned()]);
    }
}
