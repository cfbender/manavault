//! Root fields that belong to no domain: the server log subscription.

use async_graphql::{Context, SimpleObject, Subscription};
use futures_util::Stream;
use tokio_stream::StreamExt as _;
use tokio_stream::wrappers::BroadcastStream;

use manavault_core::graphql::state;

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
