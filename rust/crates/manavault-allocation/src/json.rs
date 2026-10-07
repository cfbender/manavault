//! JSON array parameters for `json_each(?)` list filters.

/// `[1,2,3]`.
pub(crate) fn id_list(ids: impl IntoIterator<Item = i64>) -> String {
    let ids: Vec<String> = ids.into_iter().map(|id| id.to_string()).collect();
    format!("[{}]", ids.join(","))
}

/// A JSON array of strings, escaped.
pub(crate) fn string_list<'a>(values: impl IntoIterator<Item = &'a str>) -> String {
    let values: Vec<&str> = values.into_iter().collect();
    serde_json::to_string(&values).unwrap_or_else(|_| "[]".to_owned())
}
