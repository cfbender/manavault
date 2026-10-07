//! Google Drive storage (`Manavault.Backup.GoogleDriveClient`): an OAuth
//! refresh token is exchanged for an access token on every operation.

use std::path::Path;
use std::time::Duration;

use serde_json::{Value, json};

use super::Remote;
use super::settings::{CloudSettings, present};
use crate::config::PlatformUrls;

const MIME: &str = "application/zip";

/// A decoded JSON body in the notation error messages have always used
/// (`nil`, quoted strings, `%{"key" => value}` maps).
#[must_use]
pub fn inspect(value: &Value) -> String {
    match value {
        Value::Null => "nil".to_owned(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => format!("{text:?}"),
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(inspect).collect::<Vec<_>>().join(", ")
        ),
        Value::Object(map) => format!(
            "%{{{}}}",
            map.iter()
                .map(|(key, value)| format!("{key:?} => {}", inspect(value)))
                .collect::<Vec<_>>()
                .join(", ")
        ),
    }
}

fn body_inspect(body: &str) -> String {
    serde_json::from_str::<Value>(body).map_or_else(
        |_| inspect(&Value::String(body.to_owned())),
        |value| inspect(&value),
    )
}

async fn response_error(operation: &str, response: reqwest::Response) -> String {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    format!(
        "{operation} failed with HTTP {status}: {}",
        body_inspect(&body)
    )
}

fn encode(value: &str) -> String {
    super::s3::uri_encode(value)
}

/// The Google Drive client.
pub struct GoogleDrive<'a> {
    pub http: &'a reqwest::Client,
    pub settings: &'a CloudSettings,
    pub urls: &'a PlatformUrls,
}

impl GoogleDrive<'_> {
    async fn access_token(&self) -> Result<String, String> {
        let form = [
            (
                "client_id",
                self.settings
                    .google_client_id
                    .as_deref()
                    .unwrap_or_default(),
            ),
            (
                "client_secret",
                self.settings
                    .google_client_secret
                    .as_deref()
                    .unwrap_or_default(),
            ),
            (
                "refresh_token",
                self.settings
                    .google_refresh_token
                    .as_deref()
                    .unwrap_or_default(),
            ),
            ("grant_type", "refresh_token"),
        ];
        let body = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(form)
            .finish();
        let response = self
            .http
            .post(&self.urls.google_oauth_token)
            .header("content-type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| crate::http_errors::transport_message(&e))?;
        if !response.status().is_success() {
            return Err(response_error("Google OAuth", response).await);
        }
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|body| body.get("access_token")?.as_str().map(str::to_owned))
            .ok_or_else(|| {
                format!(
                    "Google OAuth failed with HTTP {status}: {}",
                    body_inspect(&text)
                )
            })
    }

    fn folder(&self) -> Option<&str> {
        self.settings
            .google_folder_id
            .as_deref()
            .filter(|folder| present(Some(folder)))
    }

    pub async fn upload(&self, artifact: &Path) -> Result<Remote, String> {
        let token = self.access_token().await?;
        let filename = artifact
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mut metadata = json!({"name": filename, "mimeType": MIME});
        if let Some(folder) = self.folder()
            && let Some(object) = metadata.as_object_mut()
        {
            object.insert("parents".to_owned(), json!([folder]));
        }
        let contents = tokio::fs::read(artifact).await.map_err(|e| e.to_string())?;
        let size = contents.len();
        let boundary = format!(
            "manavault-{}",
            u32::from_be_bytes(crate::crypto::random_bytes::<4>())
        );
        let mut body = format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n--{boundary}\r\nContent-Type: {MIME}\r\n\r\n"
        )
        .into_bytes();
        body.extend_from_slice(&contents);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let response = self
            .http
            .post(&self.urls.google_drive_upload)
            .bearer_auth(&token)
            .query(&[("uploadType", "multipart"), ("fields", "id,name")])
            .header(
                "content-type",
                format!("multipart/related; boundary={boundary}"),
            )
            .timeout(Duration::from_secs(30 * 60))
            .body(body)
            .send()
            .await
            .map_err(|e| crate::http_errors::transport_message(&e))?;
        if !response.status().is_success() {
            return Err(response_error("Google Drive upload", response).await);
        }
        let created: Value = response.json().await.unwrap_or(Value::Null);
        Ok(Remote {
            id: created
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            name: created
                .get("name")
                .and_then(Value::as_str)
                .map_or(filename, str::to_owned),
            provider: "google_drive".to_owned(),
            size: i64::try_from(size).ok(),
            modified_at: Some(crate::timefmt::now()),
        })
    }

    pub async fn list(&self) -> Result<Vec<Remote>, String> {
        let token = self.access_token().await?;
        let mut q = vec![
            "name contains 'manavault-'".to_owned(),
            format!("mimeType = '{MIME}'"),
            "trashed = false".to_owned(),
        ];
        if let Some(folder) = self.folder() {
            q.insert(0, format!("'{folder}' in parents"));
        }
        let response = self
            .http
            .get(&self.urls.google_drive_files)
            .bearer_auth(&token)
            .query(&[
                ("q", q.join(" and ").as_str()),
                ("fields", "files(id,name,size,modifiedTime)"),
                ("orderBy", "modifiedTime desc"),
                ("pageSize", "100"),
            ])
            .send()
            .await
            .map_err(|e| crate::http_errors::transport_message(&e))?;
        if !response.status().is_success() {
            return Err(response_error("Google Drive list", response).await);
        }
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        let body: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        let Some(files) = body.get("files").and_then(Value::as_array) else {
            return Err(format!(
                "Google Drive list failed with HTTP {status}: {}",
                body_inspect(&text)
            ));
        };
        Ok(files
            .iter()
            .map(|file| {
                let text = |key: &str| file.get(key).and_then(Value::as_str).map(str::to_owned);
                Remote {
                    id: text("id").unwrap_or_default(),
                    name: text("name").unwrap_or_default(),
                    provider: "google_drive".to_owned(),
                    size: match file.get("size") {
                        Some(Value::Number(number)) => number.as_i64(),
                        Some(Value::String(size)) => size
                            .trim()
                            .split(|c: char| !c.is_ascii_digit())
                            .next()
                            .and_then(|digits| digits.parse().ok()),
                        _ => None,
                    },
                    modified_at: text("modifiedTime")
                        .and_then(|value| super::parse_remote_datetime(&value)),
                }
            })
            .collect())
    }

    pub async fn download(&self, file_id: &str, destination: &Path) -> Result<(), String> {
        let token = self.access_token().await?;
        let response = self
            .http
            .get(format!(
                "{}/{}",
                self.urls.google_drive_files,
                encode(file_id)
            ))
            .bearer_auth(&token)
            .query(&[("alt", "media")])
            .timeout(Duration::from_secs(30 * 60))
            .send()
            .await
            .map_err(|e| crate::http_errors::transport_message(&e))?;
        if !response.status().is_success() {
            return Err(response_error("Google Drive download", response).await);
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|e| crate::http_errors::transport_message(&e))?;
        super::write_file(destination, &bytes)
    }

    pub async fn delete(&self, file_id: &str) -> Result<(), String> {
        let token = self.access_token().await?;
        let response = self
            .http
            .delete(format!(
                "{}/{}",
                self.urls.google_drive_files,
                encode(file_id)
            ))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| crate::http_errors::transport_message(&e))?;
        if response.status().is_success() || response.status().as_u16() == 404 {
            Ok(())
        } else {
            Err(response_error("Google Drive delete", response).await)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspects_json_like_earlier_releases() {
        assert_eq!(
            inspect(&json!({"error": "invalid_grant", "n": 1, "list": [true, null]})),
            r#"%{"error" => "invalid_grant", "list" => [true, nil], "n" => 1}"#
        );
        assert_eq!(body_inspect("plain"), r#""plain""#);
    }
}
