//! Custom scalars.

use async_graphql::{InputValueError, InputValueResult, Scalar, ScalarType, Value};

/// Arbitrary JSON (`scalar :json`): passed through unchanged both ways.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Json(pub serde_json::Value);

#[Scalar(name = "Json")]
impl ScalarType for Json {
    fn parse(value: Value) -> InputValueResult<Self> {
        value
            .into_json()
            .map(Json)
            .map_err(|error| InputValueError::custom(error.to_string()))
    }

    fn to_value(&self) -> Value {
        Value::from_json(self.0.clone()).unwrap_or(Value::Null)
    }
}
