//! Root fields that belong to no domain: the server log subscription.

use async_graphql::{Context, Object, SimpleObject, Subscription};
use futures_util::Stream;
use tokio_stream::StreamExt as _;
use tokio_stream::wrappers::BroadcastStream;

use crate::graphql::state;

#[derive(Default)]
pub struct SystemQueries;

#[Object]
impl SystemQueries {
    /// Placeholder until the domain queries are merged in.
    async fn ping(&self) -> bool {
        true
    }
}

#[derive(Default)]
pub struct SystemMutations;

#[Object]
impl SystemMutations {
    /// Placeholder until the domain mutations are merged in.
    async fn noop(&self) -> bool {
        true
    }
}

#[derive(Debug, Clone, SimpleObject)]
pub struct ServerLogEvent {
    pub id: async_graphql::ID,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Default)]
pub struct SystemSubscriptions;

#[Subscription]
impl SystemSubscriptions {
    async fn server_log(&self, ctx: &Context<'_>) -> impl Stream<Item = ServerLogEvent> + use<> {
        let receiver = state(ctx).logs.subscribe();
        BroadcastStream::new(receiver).filter_map(|event| {
            event.ok().map(|event| ServerLogEvent {
                id: async_graphql::ID(event.id),
                timestamp: event.timestamp,
                level: event.level,
                message: event.message,
            })
        })
    }
}
