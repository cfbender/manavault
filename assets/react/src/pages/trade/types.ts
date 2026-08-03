import type { TradeWantsQuery } from "../../gql/graphql"

export type TradeWant = TradeWantsQuery["tradeWants"][number]
export type TradeTab = "binder" | "wants" | "matches"
