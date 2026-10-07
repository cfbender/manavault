//! S3-compatible storage (`Manavault.Backup.S3Client`): AWS, R2, `MinIO`, ...
//! Every request is a `SigV4` presigned URL (query-string auth, unsigned
//! payload, `host` the only signed header), path-style under the endpoint.

use std::fmt::Write as _;
use std::path::Path;
use std::time::Duration;

use time::OffsetDateTime;
use time::macros::format_description;

use super::Remote;
use super::settings::CloudSettings;
use crate::crypto::hmac_sha256;

const SERVICE: &str = "s3";
const ALGORITHM: &str = "AWS4-HMAC-SHA256";
const UNSIGNED_PAYLOAD: &str = "UNSIGNED-PAYLOAD";
const EXPIRES: u32 = 300;

/// RFC 3986 percent-encoding of everything but unreserved characters,
/// uppercase hex (`URI.encode(value, &unreserved?/1)`).
#[must_use]
pub fn uri_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(char::from(byte));
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

/// `URI.decode/1`, leaving malformed escapes as they are.
fn uri_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        let decoded = (byte == b'%')
            .then(|| value.get(index + 1..index + 3))
            .flatten()
            .and_then(|hex| u8::from_str_radix(hex, 16).ok());
        if let Some(decoded) = decoded {
            out.push(decoded);
            index += 3;
        } else {
            out.push(byte);
            index += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn canonical_query(query: &[(String, String)]) -> String {
    let mut sorted: Vec<&(String, String)> = query.iter().collect();
    sorted.sort();
    sorted
        .iter()
        .map(|(key, value)| format!("{}={}", uri_encode(key), uri_encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

/// The canonical URI: each segment encoded exactly once.
///
/// The Elixir client encodes the already-encoded object path a second
/// time, so keys or prefixes with characters outside `A-Za-z0-9-_.~` got
/// signatures S3 rejects (an Elixir bug); unreserved paths sign the same.
fn canonical_path(path: &str) -> String {
    path.split('/')
        .map(|segment| uri_encode(&uri_decode(segment)))
        .collect::<Vec<_>>()
        .join("/")
}

fn hex_sha256(data: &[u8]) -> String {
    crate::crypto::sha256_hex(data)
}

fn signing_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let key = hmac_sha256(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let key = hmac_sha256(&key, region.as_bytes());
    let key = hmac_sha256(&key, SERVICE.as_bytes());
    hmac_sha256(&key, b"aws4_request")
}

fn host_header(url: &url::Url) -> String {
    let host = url.host_str().unwrap_or_default();
    match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    }
}

/// Signs `url` for `method` (`build_presigned_url/6`).
#[must_use]
pub fn presigned_url(
    settings: &CloudSettings,
    method: &str,
    url: &str,
    query: &[(&str, &str)],
    expires: u32,
    now: OffsetDateTime,
) -> String {
    let Ok(mut parsed) = url::Url::parse(url) else {
        return url.to_owned();
    };
    let amz_date = now
        .format(format_description!(
            "[year][month][day]T[hour][minute][second]Z"
        ))
        .unwrap_or_default();
    let date = amz_date.get(..8).unwrap_or_default().to_owned();
    let region = settings.s3_region.as_deref().unwrap_or_default();
    let access_key = settings.s3_access_key_id.as_deref().unwrap_or_default();
    let secret = settings.s3_secret_access_key.as_deref().unwrap_or_default();
    let scope = format!("{date}/{region}/{SERVICE}/aws4_request");
    let mut signing_query: Vec<(String, String)> = query
        .iter()
        .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
        .collect();
    signing_query.extend([
        ("X-Amz-Algorithm".to_owned(), ALGORITHM.to_owned()),
        (
            "X-Amz-Credential".to_owned(),
            format!("{access_key}/{scope}"),
        ),
        ("X-Amz-Date".to_owned(), amz_date.clone()),
        ("X-Amz-Expires".to_owned(), expires.to_string()),
        ("X-Amz-SignedHeaders".to_owned(), "host".to_owned()),
    ]);
    let path = match parsed.path() {
        "" => "/",
        path => path,
    };
    let canonical_request = [
        method.to_owned(),
        canonical_path(path),
        canonical_query(&signing_query),
        format!("host:{}\n", host_header(&parsed)),
        "host".to_owned(),
        UNSIGNED_PAYLOAD.to_owned(),
    ]
    .join("\n");
    let string_to_sign = [
        ALGORITHM.to_owned(),
        amz_date,
        scope,
        hex_sha256(canonical_request.as_bytes()),
    ]
    .join("\n");
    let signature = hex::encode(hmac_sha256(
        &signing_key(secret, &date, region),
        string_to_sign.as_bytes(),
    ));
    signing_query.push(("X-Amz-Signature".to_owned(), signature));
    parsed.set_query(Some(&canonical_query(&signing_query)));
    parsed.to_string()
}

fn bucket_url(settings: &CloudSettings) -> String {
    let endpoint = settings
        .s3_endpoint
        .as_deref()
        .unwrap_or_default()
        .trim_end_matches('/');
    let bucket = settings.s3_bucket.as_deref().unwrap_or_default();
    let last_segment = url::Url::parse(endpoint).ok().and_then(|url| {
        url.path()
            .trim_matches('/')
            .split('/')
            .rfind(|segment| !segment.is_empty())
            .map(uri_decode)
    });
    if last_segment.as_deref() == Some(bucket) {
        endpoint.to_owned()
    } else {
        format!("{endpoint}/{}", uri_encode(bucket))
    }
}

fn encode_key(key: &str) -> String {
    key.split('/').map(uri_encode).collect::<Vec<_>>().join("/")
}

fn object_url(settings: &CloudSettings, key: &str) -> String {
    format!("{}/{}", bucket_url(settings), encode_key(key))
}

/// The key prefix with one trailing slash, or empty.
#[must_use]
pub fn normalized_prefix(settings: &CloudSettings) -> String {
    match settings
        .s3_prefix
        .as_deref()
        .unwrap_or_default()
        .trim_matches('/')
    {
        "" => String::new(),
        prefix => format!("{prefix}/"),
    }
}

fn basename(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_owned()
}

/// A signed upload: its URL, headers, key, and size (`build_upload_request/2`).
#[derive(Debug, Clone)]
pub struct UploadRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub key: String,
    pub size: u64,
}

pub fn build_upload_request(
    settings: &CloudSettings,
    artifact: &Path,
) -> std::io::Result<UploadRequest> {
    let filename = artifact
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let key = format!("{}{filename}", normalized_prefix(settings));
    let size = std::fs::metadata(artifact)?.len();
    let url = presigned_url(
        settings,
        "PUT",
        &object_url(settings, &key),
        &[],
        EXPIRES,
        OffsetDateTime::now_utc(),
    );
    Ok(UploadRequest {
        url,
        headers: vec![("content-length".to_owned(), size.to_string())],
        key,
        size,
    })
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn xml_text(entry: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    entry
        .find(&open)
        .and_then(|start| {
            let rest = entry.get(start + open.len()..)?;
            rest.find(&close).and_then(|end| rest.get(..end))
        })
        .map(|value| xml_unescape(value).trim().to_owned())
        .unwrap_or_default()
}

fn parse_list_response(body: &str, settings: &CloudSettings) -> Vec<Remote> {
    let prefix = normalized_prefix(settings);
    body.split("<Contents>")
        .skip(1)
        .filter_map(|chunk| chunk.split("</Contents>").next())
        .map(|entry| {
            let key = xml_text(entry, "Key");
            let name = uri_decode(key.strip_prefix(prefix.as_str()).unwrap_or(&key));
            Remote {
                id: key,
                name,
                provider: "s3".to_owned(),
                size: xml_text(entry, "Size").parse().ok(),
                modified_at: super::parse_remote_datetime(&xml_text(entry, "LastModified")),
            }
        })
        // `String.ends_with?(name, ".zip")`, case-sensitive like Elixir.
        .filter(|remote| {
            remote
                .name
                .rsplit_once('.')
                .is_some_and(|(_, ext)| ext == "zip")
        })
        .collect()
}

fn response_error(status: u16, body: &str) -> String {
    let code = xml_text(body, "Code");
    let message = xml_text(body, "Message");
    let detail = if !code.is_empty() && !message.is_empty() {
        format!("{code}: {message}")
    } else if !message.is_empty() {
        message
    } else if !body.is_empty() {
        body.to_owned()
    } else {
        "empty response body".to_owned()
    };
    let hint = if matches!(status, 401 | 403) {
        " Check the S3 Access Key ID/Secret Access Key, bucket permission, endpoint, and region."
    } else {
        ""
    };
    format!("S3 request failed with HTTP {status}: {detail}{hint}")
}

async fn check(response: reqwest::Response) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        Ok(response)
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(response_error(status.as_u16(), &body))
    }
}

/// The S3 client.
pub struct S3<'a> {
    pub http: &'a reqwest::Client,
    pub settings: &'a CloudSettings,
}

impl S3<'_> {
    pub async fn upload(&self, artifact: &Path) -> Result<Remote, String> {
        let request = build_upload_request(self.settings, artifact).map_err(|e| e.to_string())?;
        let file = tokio::fs::File::open(artifact)
            .await
            .map_err(|e| e.to_string())?;
        let body = reqwest::Body::wrap_stream(tokio_util_stream(file));
        let response = self
            .http
            .put(&request.url)
            .header("content-length", request.size)
            .timeout(Duration::from_secs(30 * 60))
            .body(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        check(response).await?;
        Ok(Remote {
            name: basename(&request.key),
            id: request.key,
            provider: "s3".to_owned(),
            size: i64::try_from(request.size).ok(),
            modified_at: Some(crate::timefmt::now()),
        })
    }

    pub async fn list(&self) -> Result<Vec<Remote>, String> {
        let prefix = normalized_prefix(self.settings);
        let url = presigned_url(
            self.settings,
            "GET",
            &bucket_url(self.settings),
            &[("list-type", "2"), ("prefix", &prefix), ("max-keys", "100")],
            EXPIRES,
            OffsetDateTime::now_utc(),
        );
        let response = self.http.get(url).send().await.map_err(|e| e.to_string())?;
        let body = check(response)
            .await?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        Ok(parse_list_response(&body, self.settings))
    }

    pub async fn download(&self, key: &str, destination: &Path) -> Result<(), String> {
        let url = presigned_url(
            self.settings,
            "GET",
            &object_url(self.settings, key),
            &[],
            EXPIRES,
            OffsetDateTime::now_utc(),
        );
        let response = self
            .http
            .get(url)
            .timeout(Duration::from_secs(30 * 60))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let bytes = check(response)
            .await?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        super::write_file(destination, &bytes)
    }

    pub async fn delete(&self, key: &str) -> Result<(), String> {
        let url = presigned_url(
            self.settings,
            "DELETE",
            &object_url(self.settings, key),
            &[],
            EXPIRES,
            OffsetDateTime::now_utc(),
        );
        let response = self
            .http
            .delete(url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        check(response).await.map(|_| ())
    }
}

/// Streams a file in 64 KB chunks.
fn tokio_util_stream(
    file: tokio::fs::File,
) -> impl futures_util::Stream<Item = std::io::Result<bytes::Bytes>> {
    futures_util::stream::unfold(file, |mut file| async move {
        use tokio::io::AsyncReadExt as _;
        let mut buffer = vec![0_u8; 64_000];
        match file.read(&mut buffer).await {
            Ok(0) => None,
            Ok(read) => {
                buffer.truncate(read);
                Some((Ok(bytes::Bytes::from(buffer)), file))
            }
            Err(error) => Some((Err(error), file)),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn query(url: &str) -> std::collections::HashMap<String, String> {
        url::Url::parse(url)
            .unwrap()
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect()
    }

    #[test]
    fn matches_the_aws_presigned_url_example() {
        let settings = CloudSettings {
            s3_region: Some("us-east-1".into()),
            s3_access_key_id: Some("AKIAIOSFODNN7EXAMPLE".into()),
            s3_secret_access_key: Some("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".into()),
            ..CloudSettings::blank()
        };
        let url = presigned_url(
            &settings,
            "GET",
            "https://examplebucket.s3.amazonaws.com/test.txt",
            &[],
            86_400,
            datetime!(2013-05-24 00:00:00 UTC),
        );
        assert_eq!(
            query(&url)["X-Amz-Signature"],
            "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
        );
    }

    fn r2(endpoint: &str) -> CloudSettings {
        CloudSettings {
            provider: "s3".into(),
            s3_endpoint: Some(endpoint.into()),
            s3_bucket: Some("cfb-manavault".into()),
            s3_region: Some("auto".into()),
            s3_prefix: Some("manavault".into()),
            s3_access_key_id: Some("access-key".into()),
            s3_secret_access_key: Some("secret-key".into()),
            ..CloudSettings::blank()
        }
    }

    #[test]
    fn builds_r2_compatible_path_style_uploads() {
        let dir = crate::test_support::TempDir::new();
        let path = dir.path().join("manavault-s3-client-test.zip");
        std::fs::write(&path, "backup").unwrap();
        let request = build_upload_request(
            &r2("https://ea1814f339faeaa18ed052b7003134f9.r2.cloudflarestorage.com"),
            &path,
        )
        .unwrap();
        let url = url::Url::parse(&request.url).unwrap();
        assert_eq!(
            format!(
                "{}://{}{}",
                url.scheme(),
                url.host_str().unwrap(),
                url.path()
            ),
            "https://ea1814f339faeaa18ed052b7003134f9.r2.cloudflarestorage.com/cfb-manavault/manavault/manavault-s3-client-test.zip"
        );
        assert_eq!(request.key, "manavault/manavault-s3-client-test.zip");
        assert_eq!(request.headers, vec![("content-length".into(), "6".into())]);
        let query = query(&request.url);
        assert_eq!(query["X-Amz-Algorithm"], "AWS4-HMAC-SHA256");
        assert!(query["X-Amz-Credential"].starts_with("access-key/"));
        assert!(query["X-Amz-Credential"].ends_with("/auto/s3/aws4_request"));
        assert_eq!(query["X-Amz-SignedHeaders"], "host");
        assert_eq!(query["X-Amz-Signature"].len(), 64);

        let request = build_upload_request(
            &r2("https://ea1814f339faeaa18ed052b7003134f9.r2.cloudflarestorage.com/cfb-manavault"),
            &path,
        )
        .unwrap();
        assert_eq!(
            url::Url::parse(&request.url).unwrap().path(),
            "/cfb-manavault/manavault/manavault-s3-client-test.zip"
        );
    }

    #[test]
    fn parses_list_responses_and_errors() {
        let settings = r2("https://s3.test");
        let body = "<ListBucketResult><Contents><Key>manavault/manavault-cloud-1.zip</Key><LastModified>2026-06-27T03:00:00.000Z</LastModified><Size>12</Size></Contents><Contents><Key>manavault/notes.txt</Key><Size>1</Size></Contents></ListBucketResult>";
        let remotes = parse_list_response(body, &settings);
        assert_eq!(
            remotes,
            vec![Remote {
                id: "manavault/manavault-cloud-1.zip".into(),
                name: "manavault-cloud-1.zip".into(),
                provider: "s3".into(),
                size: Some(12),
                modified_at: Some("2026-06-27T03:00:00.000Z".into()),
            }]
        );
        assert_eq!(
            response_error(
                403,
                "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>"
            ),
            "S3 request failed with HTTP 403: AccessDenied: Access Denied Check the S3 Access Key ID/Secret Access Key, bucket permission, endpoint, and region."
        );
        assert_eq!(
            response_error(500, ""),
            "S3 request failed with HTTP 500: empty response body"
        );
    }
}
