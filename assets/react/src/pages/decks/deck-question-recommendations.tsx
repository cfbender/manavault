import { useApolloClient, useMutation } from "@apollo/client/react"
import { Check, LoaderCircle, Plus, Scissors } from "lucide-react"
import { useState, type Dispatch, type SetStateAction } from "react"

import { Button } from "../../components/ui/button"
import type { DeckQuestionAnswersQuery } from "../../gql/graphql"
import { refetchActiveQueries } from "../../lib/apollo"
import type { DeckCardEntry } from "./deck-types"
import { AddDeckCardDocument, UpdateDeckCardsTagDocument } from "./queries"

type QuestionAnswer = DeckQuestionAnswersQuery["deckQuestionAnswers"][number]
type RecommendationFeedback = { tone: "error" | "success"; message: string } | null

export function QuestionRecommendations({
  deckCards,
  deckId,
  questionAnswer,
}: {
  deckCards: DeckCardEntry[]
  deckId: string
  questionAnswer: QuestionAnswer
}) {
  const { recommendedAdditions, recommendedCuts } = questionAnswer
  const client = useApolloClient()
  const [selectedCuts, setSelectedCuts] = useState(() => new Set(recommendedCuts))
  const [selectedAdditions, setSelectedAdditions] = useState(() => new Set(recommendedAdditions))
  const [completedCuts, setCompletedCuts] = useState<Set<string>>(() => new Set())
  const [completedAdditions, setCompletedAdditions] = useState<Set<string>>(() => new Set())
  const [additionsPending, setAdditionsPending] = useState(false)
  const [cutFeedback, setCutFeedback] = useState<RecommendationFeedback>(null)
  const [additionFeedback, setAdditionFeedback] = useState<RecommendationFeedback>(null)
  const [updateDeckCardsTag, cutMutation] = useMutation(UpdateDeckCardsTagDocument)
  const [addDeckCard] = useMutation(AddDeckCardDocument)

  if (!recommendedCuts.length && !recommendedAdditions.length) return null

  function matchingDeckCards(cardName: string) {
    const key = cardName.toLocaleLowerCase()
    return deckCards.filter(
      (deckCard) =>
        deckCard.zone !== "considering" && deckCard.card?.name.toLocaleLowerCase() === key,
    )
  }

  function cutState(cardName: string) {
    const matches = matchingDeckCards(cardName)
    const pendingDeckCards = matches.filter((deckCard) => deckCard.tag !== "consider_cutting")

    return {
      applied: completedCuts.has(cardName) || (matches.length > 0 && !pendingDeckCards.length),
      deckCardIds: pendingDeckCards.map(({ id }) => id),
      unavailable: !matches.length,
    }
  }

  function additionState(cardName: string) {
    const key = cardName.toLocaleLowerCase()
    return {
      applied:
        completedAdditions.has(cardName) ||
        deckCards.some(
          (deckCard) =>
            deckCard.zone === "considering" && deckCard.card?.name.toLocaleLowerCase() === key,
        ),
    }
  }

  const actionableCuts = recommendedCuts.filter((cardName) => {
    const state = cutState(cardName)
    return selectedCuts.has(cardName) && !state.applied && !state.unavailable
  })
  const actionableAdditions = recommendedAdditions.filter((cardName) => {
    const state = additionState(cardName)
    return selectedAdditions.has(cardName) && !state.applied
  })

  function setSelected(
    setter: Dispatch<SetStateAction<Set<string>>>,
    cardName: string,
    checked: boolean,
  ) {
    setter((current) => {
      const next = new Set(current)
      if (checked) next.add(cardName)
      else next.delete(cardName)
      return next
    })
  }

  async function markSelectedCuts() {
    const deckCardIds = [
      ...new Set(actionableCuts.flatMap((cardName) => cutState(cardName).deckCardIds)),
    ]
    if (!deckCardIds.length) return

    setCutFeedback(null)
    try {
      await updateDeckCardsTag({
        variables: { deckCardIds, tag: "consider_cutting" },
      })
      setCompletedCuts((current) => new Set([...current, ...actionableCuts]))
      setCutFeedback({
        tone: "success",
        message: `${actionableCuts.length} ${actionableCuts.length === 1 ? "card" : "cards"} marked Consider Cutting.`,
      })
      void refetchActiveQueries(client)
    } catch (error) {
      setCutFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not mark the selected cuts.",
      })
    }
  }

  async function addSelectedToConsidering() {
    if (!actionableAdditions.length) return

    setAdditionFeedback(null)
    setAdditionsPending(true)
    const added: string[] = []
    const failed: string[] = []

    for (const cardName of actionableAdditions) {
      try {
        await addDeckCard({
          variables: { deckId, input: { name: cardName, quantity: 1, zone: "considering" } },
        })
        added.push(cardName)
      } catch {
        failed.push(cardName)
      }
    }

    if (added.length) {
      setCompletedAdditions((current) => new Set([...current, ...added]))
      void refetchActiveQueries(client)
    }

    if (failed.length) {
      setAdditionFeedback({
        tone: "error",
        message: `${added.length ? `Added ${added.length}. ` : ""}Could not add ${failed.join(", ")}. Try again.`,
      })
    } else {
      setAdditionFeedback({
        tone: "success",
        message: `${added.length} ${added.length === 1 ? "card" : "cards"} added to Considering.`,
      })
    }
    setAdditionsPending(false)
  }

  return (
    <section className="mt-5 border-t border-base-300 pt-4" aria-label="Suggested deck changes">
      <div className="mb-4">
        <h4 className="text-base font-black">Suggested deck changes</h4>
        <p className="mt-1 max-w-[65ch] text-sm text-base-content/60">
          Select the advice you want to act on. Each suggestion starts selected.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:divide-x md:divide-base-300">
        {recommendedCuts.length ? (
          <div className={recommendedAdditions.length ? "md:pr-5" : "md:col-span-2"}>
            <h5 className="flex items-center gap-2 text-sm font-black">
              <Scissors className="h-4 w-4 text-warning" aria-hidden="true" />
              Cuts
              <span className="text-xs font-bold text-base-content/50">
                {recommendedCuts.length}
              </span>
            </h5>
            <div className="mt-2 space-y-1">
              {recommendedCuts.map((cardName) => {
                const state = cutState(cardName)
                return (
                  <RecommendationChoice
                    key={cardName}
                    checked={selectedCuts.has(cardName)}
                    disabled={state.applied || state.unavailable || cutMutation.loading}
                    label={cardName}
                    status={
                      state.applied ? "Marked" : state.unavailable ? "No longer in deck" : undefined
                    }
                    onChange={(checked) => setSelected(setSelectedCuts, cardName, checked)}
                  />
                )
              })}
            </div>
            <Button
              className="mt-3 w-full disabled:border-base-300 disabled:bg-base-200 disabled:text-base-content disabled:opacity-100 sm:w-auto"
              size="sm"
              type="button"
              variant="outline"
              disabled={!actionableCuts.length || cutMutation.loading}
              onClick={() => void markSelectedCuts()}
            >
              {cutMutation.loading ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Scissors className="h-4 w-4" aria-hidden="true" />
              )}
              {cutMutation.loading
                ? "Marking…"
                : `Mark ${actionableCuts.length || "selected"} Consider Cutting`}
            </Button>
            <RecommendationFeedbackMessage feedback={cutFeedback} />
          </div>
        ) : null}

        {recommendedAdditions.length ? (
          <div className={recommendedCuts.length ? "md:pl-5" : "md:col-span-2"}>
            <h5 className="flex items-center gap-2 text-sm font-black">
              <Plus className="h-4 w-4 text-success" aria-hidden="true" />
              Additions
              <span className="text-xs font-bold text-base-content/50">
                {recommendedAdditions.length}
              </span>
            </h5>
            <div className="mt-2 space-y-1">
              {recommendedAdditions.map((cardName) => {
                const state = additionState(cardName)
                return (
                  <RecommendationChoice
                    key={cardName}
                    checked={selectedAdditions.has(cardName)}
                    disabled={state.applied || additionsPending}
                    label={cardName}
                    status={state.applied ? "Already considering" : undefined}
                    onChange={(checked) => setSelected(setSelectedAdditions, cardName, checked)}
                  />
                )
              })}
            </div>
            <Button
              className="mt-3 w-full disabled:border-base-300 disabled:bg-base-200 disabled:text-base-content disabled:opacity-100 sm:w-auto"
              size="sm"
              type="button"
              disabled={!actionableAdditions.length || additionsPending}
              onClick={() => void addSelectedToConsidering()}
            >
              {additionsPending ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {additionsPending
                ? "Adding…"
                : `Add ${actionableAdditions.length || "selected"} to Considering`}
            </Button>
            <RecommendationFeedbackMessage feedback={additionFeedback} />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function RecommendationChoice({
  checked,
  disabled,
  label,
  onChange,
  status,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: (checked: boolean) => void
  status?: string
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-btn px-2 py-2 hover:bg-base-200 has-[:disabled]:cursor-default has-[:disabled]:opacity-65">
      <input
        className="checkbox checkbox-sm checkbox-primary"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1 break-words text-sm font-bold">{label}</span>
      {status ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold ${status === "No longer in deck" ? "text-base-content/55" : "text-success"}`}
        >
          {status === "No longer in deck" ? null : <Check className="h-3.5 w-3.5" aria-hidden />}
          {status}
        </span>
      ) : null}
    </label>
  )
}

function RecommendationFeedbackMessage({ feedback }: { feedback: RecommendationFeedback }) {
  if (!feedback) return null

  return (
    <p
      className={`mt-2 text-xs font-bold ${feedback.tone === "error" ? "text-error" : "text-success"}`}
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  )
}
