//! The document limits `Absinthe.Plug` applies to `/share/graphql`
//! (`token_limit: 5_000`, `analyze_complexity: true, max_complexity:
//! 100_000`), plus the query-only rule, checked before execution so the
//! errors read like Absinthe's. The depth limit is
//! [`crate::web::public_graphql::check_depth`].
//!
//! The schema also sets async-graphql's own `limit_complexity` and
//! `limit_depth` with the same costs, as a backstop; these checks run first.

use async_graphql::parser::types::{
    DocumentOperations, ExecutableDocument, OperationDefinition, OperationType, Selection,
    SelectionSet,
};
use async_graphql::{Pos, Positioned};

/// Absinthe's `token_limit`.
pub const TOKEN_LIMIT: usize = 5_000;
/// Absinthe's `max_complexity`.
pub const MAX_COMPLEXITY: u64 = 100_000;

/// A rejection, rendered as one GraphQL error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rejection {
    pub message: String,
    pub locations: Vec<Pos>,
}

impl Rejection {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            locations: Vec::new(),
        }
    }

    /// The error as JSON (`{"message": ..., "locations": [...]}`).
    #[must_use]
    pub fn to_json(&self) -> serde_json::Value {
        let mut error = serde_json::json!({"message": self.message});
        if !self.locations.is_empty()
            && let Some(object) = error.as_object_mut()
        {
            object.insert(
                "locations".to_owned(),
                self.locations
                    .iter()
                    .map(|pos| serde_json::json!({"line": pos.line, "column": pos.column}))
                    .collect(),
            );
        }
        error
    }
}

/// Counts lexical tokens like `Absinthe.Lexer`, stopping once `limit` is
/// passed: punctuators, names, numbers, and strings each count once;
/// whitespace, commas, and comments do not.
#[must_use]
pub fn token_count(document: &str, limit: usize) -> usize {
    let mut chars = document.chars().peekable();
    let mut count = 0usize;
    while let Some(c) = chars.next() {
        if count > limit {
            break;
        }
        match c {
            ' ' | '\t' | '\n' | '\r' | ',' | '\u{feff}' => {}
            '#' => {
                while let Some(&next) = chars.peek() {
                    if next == '\n' || next == '\r' {
                        break;
                    }
                    chars.next();
                }
            }
            '"' => {
                count += 1;
                let block = chars.peek() == Some(&'"') && {
                    let mut lookahead = chars.clone();
                    lookahead.next();
                    lookahead.peek() == Some(&'"')
                };
                if block {
                    chars.next();
                    chars.next();
                    let mut quotes = 0;
                    while let Some(next) = chars.next() {
                        match next {
                            '"' => {
                                quotes += 1;
                                if quotes == 3 {
                                    break;
                                }
                            }
                            '\\' if quotes == 0 => {
                                // `\"""` escapes a closing delimiter.
                                if chars.peek() == Some(&'"') {
                                    chars.next();
                                }
                            }
                            _ => quotes = 0,
                        }
                    }
                } else {
                    while let Some(next) = chars.next() {
                        match next {
                            '"' | '\n' | '\r' => break,
                            '\\' => {
                                chars.next();
                            }
                            _ => {}
                        }
                    }
                }
            }
            '.' => {
                // `...` is one punctuator.
                count += 1;
                for _ in 0..2 {
                    if chars.peek() == Some(&'.') {
                        chars.next();
                    }
                }
            }
            c if c.is_ascii_alphabetic() || c == '_' => {
                count += 1;
                while chars
                    .peek()
                    .is_some_and(|next| next.is_ascii_alphanumeric() || *next == '_')
                {
                    chars.next();
                }
            }
            c if c.is_ascii_digit() || c == '-' => {
                count += 1;
                while chars.peek().is_some_and(|next| {
                    next.is_ascii_alphanumeric() || matches!(next, '.' | '+' | '-')
                }) {
                    chars.next();
                }
            }
            _ => count += 1,
        }
    }
    count
}

/// `token_limit`: "Token limit exceeded" past [`TOKEN_LIMIT`] tokens.
pub fn check_tokens(document: &str) -> Result<(), Rejection> {
    if token_count(document, TOKEN_LIMIT) > TOKEN_LIMIT {
        Err(Rejection::new("Token limit exceeded"))
    } else {
        Ok(())
    }
}

/// The operation that would run, if the document names one unambiguously.
#[must_use]
pub fn selected_operation<'a>(
    document: &'a ExecutableDocument,
    operation_name: Option<&str>,
) -> Option<&'a Positioned<OperationDefinition>> {
    match (&document.operations, operation_name) {
        (DocumentOperations::Single(operation), _) => Some(operation),
        (DocumentOperations::Multiple(operations), Some(name)) => operations.get(name),
        (DocumentOperations::Multiple(operations), None) if operations.len() == 1 => {
            operations.values().next()
        }
        (DocumentOperations::Multiple(_), None) => None,
    }
}

/// The public schema has only a query root: mutations and subscriptions
/// are refused (`FieldsOnCorrectType`: `Operation "mutation" not supported`).
pub fn check_operation_type(
    document: &ExecutableDocument,
    operation_name: Option<&str>,
) -> Result<(), Rejection> {
    let Some(operation) = selected_operation(document, operation_name) else {
        return Ok(());
    };
    let kind = match operation.node.ty {
        OperationType::Query => return Ok(()),
        OperationType::Mutation => "mutation",
        OperationType::Subscription => "subscription",
    };
    Err(Rejection {
        message: format!("Operation \"{kind}\" not supported"),
        locations: vec![operation.pos],
    })
}

/// The cost of a field with its children's cost, as the public schema
/// declares it (`complexity/2` callbacks); 1 + children otherwise.
fn field_cost(name: &str, at_root: bool, children: u64) -> u64 {
    match (at_root, name) {
        (true, "deck" | "card" | "cardByName") => children.saturating_add(10_000),
        (true, "deckBuylist" | "deckBuylistExport" | "wantsList" | "binderList") => {
            children.saturating_add(20_000)
        }
        (false, "deckCards") => children.saturating_mul(500),
        (false, "printings") => children.saturating_mul(300),
        _ => children.saturating_add(1),
    }
}

/// A node of the complexity tree, in document order.
struct Node {
    label: String,
    pos: Pos,
    complexity: u64,
    children: Vec<Node>,
}

struct Analysis<'a> {
    document: &'a ExecutableDocument,
    visiting: Vec<String>,
}

impl Analysis<'_> {
    fn selections(&mut self, set: &SelectionSet, at_root: bool) -> Vec<Node> {
        set.items
            .iter()
            .map(|selection| match &selection.node {
                Selection::Field(field) => {
                    let children = self.selections(&field.node.selection_set.node, false);
                    let sum = total(&children);
                    let name = field.node.name.node.as_str();
                    Node {
                        label: format!("Field {name}"),
                        pos: selection.pos,
                        complexity: field_cost(name, at_root, sum),
                        children,
                    }
                }
                Selection::InlineFragment(fragment) => {
                    let children = self.selections(&fragment.node.selection_set.node, at_root);
                    Node {
                        label: "Inline Fragment".to_owned(),
                        pos: selection.pos,
                        complexity: total(&children),
                        children,
                    }
                }
                Selection::FragmentSpread(spread) => {
                    let name = spread.node.fragment_name.node.as_str();
                    let children = match self.document.fragments.get(name) {
                        Some(fragment) if !self.visiting.iter().any(|v| v == name) => {
                            self.visiting.push(name.to_owned());
                            let children =
                                self.selections(&fragment.node.selection_set.node, at_root);
                            self.visiting.pop();
                            children
                        }
                        _ => Vec::new(),
                    };
                    Node {
                        label: format!("Spread {name}"),
                        pos: selection.pos,
                        complexity: total(&children),
                        children,
                    }
                }
            })
            .collect()
    }
}

fn total(nodes: &[Node]) -> u64 {
    nodes
        .iter()
        .fold(0u64, |sum, node| sum.saturating_add(node.complexity))
}

/// Absinthe's `Complexity.Result` walk: every node over the limit reports,
/// descending only below nodes that are over it.
fn collect(node: &Node, errors: &mut Vec<Rejection>) {
    if node.complexity <= MAX_COMPLEXITY {
        return;
    }
    errors.push(Rejection {
        message: format!(
            "{} is too complex: complexity is {} and maximum is {MAX_COMPLEXITY}",
            node.label, node.complexity
        ),
        locations: vec![node.pos],
    });
    for child in &node.children {
        collect(child, errors);
    }
}

/// The operation's complexity under the public schema's costs.
#[must_use]
pub fn operation_complexity(
    document: &ExecutableDocument,
    operation_name: Option<&str>,
) -> Option<u64> {
    let operation = selected_operation(document, operation_name)?;
    let mut analysis = Analysis {
        document,
        visiting: Vec::new(),
    };
    Some(total(
        &analysis.selections(&operation.node.selection_set.node, true),
    ))
}

/// `analyze_complexity` with `max_complexity: 100_000`: one error for the
/// operation and each over-limit field, spread, or inline fragment.
pub fn check_complexity(
    document: &ExecutableDocument,
    operation_name: Option<&str>,
) -> Result<(), Vec<Rejection>> {
    let Some(operation) = selected_operation(document, operation_name) else {
        return Ok(());
    };
    let mut analysis = Analysis {
        document,
        visiting: Vec::new(),
    };
    let children = analysis.selections(&operation.node.selection_set.node, true);
    let label = match document_operation_name(document, operation_name) {
        Some(name) => format!("Operation {name}"),
        None => "Operation".to_owned(),
    };
    let root = Node {
        label,
        pos: operation.pos,
        complexity: total(&children),
        children,
    };
    let mut errors = Vec::new();
    collect(&root, &mut errors);
    if errors.is_empty() {
        Ok(())
    } else {
        // Absinthe prepends while walking, so the deepest error comes first.
        errors.reverse();
        Err(errors)
    }
}

fn document_operation_name<'a>(
    document: &'a ExecutableDocument,
    operation_name: Option<&'a str>,
) -> Option<&'a str> {
    match &document.operations {
        DocumentOperations::Single(_) => None,
        DocumentOperations::Multiple(operations) => match operation_name {
            Some(name) => Some(name),
            None => operations.keys().next().map(async_graphql::Name::as_str),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_count_like_the_absinthe_lexer() {
        assert_eq!(token_count("query { __typename }", 100), 4);
        assert_eq!(
            token_count("{ a(x: \"a, b { c\", y: -1.5e3) ...F }", 100),
            13
        );
        assert_eq!(token_count("# comment { }\n{ a }", 100), 3);
        assert_eq!(token_count("{ a(s: \"\"\"x \"\" y\"\"\") }", 100), 8);
        let heavy = format!("query {{ {}}}", "__typename ".repeat(5_001));
        assert!(check_tokens(&heavy).is_err());
        let fine = format!("query {{ {}}}", "__typename ".repeat(4_997));
        assert!(check_tokens(&fine).is_ok());
    }

    #[test]
    fn complexity_uses_the_public_costs() {
        let parse = |query: &str| async_graphql::parser::parse_query(query).unwrap();
        let document =
            parse("{ deck(id: \"x\") { deckCards(first: 500) { edges { node { quantity } } } } }");
        assert_eq!(operation_complexity(&document, None), Some(10_000 + 1_500));
        let document = parse(
            "{ card(id: \"x\") { printings { edges { node { id } } } } wantsList(id: \"y\") { entries { cardName } } }",
        );
        assert_eq!(
            operation_complexity(&document, None),
            Some(10_000 + 900 + 20_000 + 2)
        );
        let selections = (1..=70)
            .map(|i| format!("c{i}: deckCards(first: 500) {{ edges {{ node {{ quantity }} }} }}"))
            .collect::<Vec<_>>()
            .join(" ");
        let document = parse(&format!("query {{ deck(id: \"x\") {{ {selections} }} }}"));
        let errors = check_complexity(&document, None).unwrap_err();
        let messages: Vec<&str> = errors.iter().map(|e| e.message.as_str()).collect();
        assert_eq!(
            messages,
            vec![
                "Field deck is too complex: complexity is 115000 and maximum is 100000",
                "Operation is too complex: complexity is 115000 and maximum is 100000",
            ]
        );
    }

    #[test]
    fn only_queries_are_supported() {
        let document = async_graphql::parser::parse_query("mutation { __typename }").unwrap();
        assert_eq!(
            check_operation_type(&document, None).unwrap_err().message,
            "Operation \"mutation\" not supported"
        );
    }
}
