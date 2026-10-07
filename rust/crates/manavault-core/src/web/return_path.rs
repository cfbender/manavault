//! Post-login redirect targets (`ManavaultWeb.AuthReturnPath`): only local,
//! single-slash absolute paths survive, including after one or two rounds
//! of percent or form decoding, so no variant can become an open redirect.

/// Returns `path` when it is a safe local destination, else `/`.
#[must_use]
pub fn sanitize(path: Option<&str>) -> String {
    match path {
        Some(path) if safe(path) => path.to_owned(),
        _ => "/".to_owned(),
    }
}

fn safe(path: &str) -> bool {
    local_absolute_path(path) && decoded_variants_safe(path)
}

fn unsafe_byte(byte: u8) -> bool {
    byte <= 31 || byte == 127 || byte == b'\\'
}

fn local_absolute_path(path: &str) -> bool {
    !path.bytes().any(unsafe_byte) && valid_percent_encoding(path) && absolute_path_uri(path)
}

fn valid_percent_encoding(path: &str) -> bool {
    let bytes = path.as_bytes();
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte == b'%' {
            let hex = |offset: usize| bytes.get(index + offset).is_some_and(u8::is_ascii_hexdigit);
            if !(hex(1) && hex(2)) {
                return false;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    true
}

/// `URI.new/1` succeeds with no scheme, userinfo, host, or port, and the
/// path is single-slash absolute. `URI.new` rejects characters outside
/// RFC 3986 (spaces, brackets, non-ASCII, a second `#`, ...).
fn absolute_path_uri(path: &str) -> bool {
    let allowed = |c: char| c.is_ascii_alphanumeric() || "-._~!$&'()*+,;=:@/?%#".contains(c);
    if !path.chars().all(allowed) || path.matches('#').count() > 1 {
        return false;
    }
    let uri_path = path.split(['?', '#']).next().unwrap_or_default();
    single_slash_path(uri_path.as_bytes())
}

fn single_slash_path(path: &[u8]) -> bool {
    path.starts_with(b"/") && !path.starts_with(b"//")
}

fn decoded_variants_safe(path: &str) -> bool {
    let Some(percent) = decode(path.as_bytes(), false) else {
        return false;
    };
    let Some(form) = decode(path.as_bytes(), true) else {
        return false;
    };
    let variants = [
        Some(path.as_bytes().to_vec()),
        Some(percent.clone()),
        Some(form.clone()),
        decode(&percent, false),
        decode(&percent, true),
        decode(&form, false),
        decode(&form, true),
    ];
    variants.into_iter().all(|variant| {
        variant.is_some_and(|bytes| {
            std::str::from_utf8(&bytes).is_ok()
                && !bytes.iter().copied().any(unsafe_byte)
                && single_slash_path(&bytes)
        })
    })
}

/// `URI.decode/1` (or `URI.decode_www_form/1` with `plus`); `None` where
/// the escape is malformed.
fn decode(bytes: &[u8], plus: bool) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        match byte {
            b'%' => {
                let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                index += 3;
            }
            b'+' if plus => {
                out.push(b' ');
                index += 1;
            }
            other => {
                out.push(other);
                index += 1;
            }
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_safe_local_destinations() {
        for (label, input, expected) in crate::testing::RETURN_PATH_CASES {
            assert_eq!(sanitize(Some(input)), expected, "{label}");
        }
        assert_eq!(sanitize(None), "/");
        assert_eq!(sanitize(Some("/a b")), "/");
        assert_eq!(sanitize(Some("/%25ZZ")), "/");
        assert_eq!(sanitize(Some("/cards?q=t%3Alegend")), "/cards?q=t%3Alegend");
    }
}
