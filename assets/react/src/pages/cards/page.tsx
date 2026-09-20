import { CardCatalogPage, type CardCatalogPageProps } from "./card-catalog-page"

export { CardDetailPage } from "./card-detail-page"
export type { CardReturnEdhrecTab } from "./card-detail-page"

export function CardsPage(props: CardCatalogPageProps) {
  const routeKey = `${props.query}\0${props.filterSearch ?? ""}\0${props.sort ?? ""}`
  return <CardCatalogPage key={routeKey} {...props} />
}
