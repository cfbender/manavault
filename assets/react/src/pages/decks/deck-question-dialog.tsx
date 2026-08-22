import { useMutation, useQuery } from "@apollo/client/react"
import { ChevronDown, LoaderCircle, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useState, type FormEvent, type MouseEvent } from "react"
import type { DeckQuestionAnswersQuery } from "../../gql/graphql"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Textarea } from "../../components/ui/textarea"
import { DeckMarkdown } from "./deck-primer"
import { QuestionRecommendations } from "./deck-question-recommendations"
import type { DeckCardEntry } from "./deck-types"
import {
  AskDeckQuestionDocument,
  DeckQuestionAnswersDocument,
  DeleteDeckQuestionAnswerDocument,
} from "./queries"

type QuestionAnswer = DeckQuestionAnswersQuery["deckQuestionAnswers"][number]

const questionDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function DeckQuestionDialog({
  deckId,
  deckName,
  deckCards,
  onOpenChange,
  open,
}: {
  deckId: string
  deckName: string
  deckCards: DeckCardEntry[]
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [question, setQuestion] = useState("")
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswer[]>([])
  const [deletingQuestionAnswer, setDeletingQuestionAnswer] = useState<QuestionAnswer | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const questionAnswersQuery = useQuery(DeckQuestionAnswersDocument, {
    fetchPolicy: "network-only",
    variables: { deckId },
    skip: !open,
  })
  const [askDeckQuestion, questionMutation] = useMutation(AskDeckQuestionDocument)
  const [deleteDeckQuestionAnswer, deleteMutation] = useMutation(DeleteDeckQuestionAnswerDocument)

  useEffect(() => {
    setQuestionAnswers([])
  }, [deckId])

  useEffect(() => {
    if (questionAnswersQuery.data) {
      setQuestionAnswers(questionAnswersQuery.data.deckQuestionAnswers)
    }
  }, [questionAnswersQuery.data])

  useEffect(() => {
    const pending = questionAnswers.some(({ status }) => status === "pending")

    if (open && pending) {
      questionAnswersQuery.startPolling(2_000)
    } else {
      questionAnswersQuery.stopPolling()
    }

    return () => questionAnswersQuery.stopPolling()
  }, [open, questionAnswers, questionAnswersQuery.startPolling, questionAnswersQuery.stopPolling])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion) {
      setFormError("Enter a question about this deck.")
      return
    }

    setFormError(null)
    void askDeckQuestion({
      variables: { id: deckId, question: trimmedQuestion },
      onCompleted: (data) => {
        const savedAnswer = data.askDeckQuestion?.questionAnswer

        if (savedAnswer) {
          setQuestionAnswers((current) => [
            savedAnswer,
            ...current.filter(({ id }) => id !== savedAnswer.id),
          ])
          setQuestion("")
        } else {
          setFormError("The question could not be queued. Try asking again.")
        }
      },
      onError: (error) => setFormError(error.message),
    })
  }

  function deleteSelectedQuestionAnswer() {
    if (!deletingQuestionAnswer) return

    void deleteDeckQuestionAnswer({
      variables: { id: deletingQuestionAnswer.id },
      onCompleted: (data) => {
        const deletedId = data.deleteDeckQuestionAnswer?.questionAnswerId
        if (deletedId) {
          setQuestionAnswers((current) => current.filter(({ id }) => id !== deletedId))
        }
      },
      onError: (error) => setFormError(error.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        labelledBy="deck-question-title"
        describedBy="deck-question-description"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="deck-question-title">Ask about this deck</DialogTitle>
            <p id="deck-question-description" className="mt-1 text-sm text-base-content/60">
              {deckName}
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <label
                className="block text-sm font-bold text-base-content"
                htmlFor="deck-question-input"
              >
                Your question
              </label>
              <Textarea
                id="deck-question-input"
                className="min-h-28 resize-y"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Would Doubling Season be a good card in this deck?"
                maxLength={1_000}
                autoFocus
                disabled={questionMutation.loading}
                aria-describedby="deck-question-help"
              />
              <p id="deck-question-help" className="max-w-[65ch] text-xs text-base-content/60">
                Ask about card fit, possible cuts, matchups, or how a change affects the game plan.
                Answers use the AI provider configured in Settings and are saved with this deck.
              </p>
            </div>

            {formError ? (
              <p
                className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
                role="alert"
              >
                {formError}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button
                className="disabled:border-base-300 disabled:bg-base-200 disabled:text-base-content disabled:opacity-100"
                type="submit"
                disabled={!question.trim() || questionMutation.loading}
              >
                {questionMutation.loading ? (
                  <LoaderCircle
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {questionMutation.loading ? "Thinking…" : "Ask question"}
              </Button>
            </div>
          </form>

          <QuestionHistory
            deckCards={deckCards}
            deckId={deckId}
            deleting={deleteMutation.loading}
            error={questionAnswersQuery.error?.message}
            loading={questionAnswersQuery.loading && !questionAnswersQuery.data}
            questionAnswers={questionAnswers}
            onDelete={setDeletingQuestionAnswer}
            onRetry={() => void questionAnswersQuery.refetch()}
          />
        </div>
      </DialogContent>

      <ConfirmDialog
        destructive
        confirmLabel="Delete saved answer"
        open={deletingQuestionAnswer !== null}
        title="Delete saved question?"
        onConfirm={deleteSelectedQuestionAnswer}
        onOpenChange={(nextOpen) => !nextOpen && setDeletingQuestionAnswer(null)}
      >
        This permanently removes this question and its answer from {deckName}.
      </ConfirmDialog>
    </Dialog>
  )
}

function QuestionHistory({
  deckCards,
  deckId,
  deleting,
  error,
  loading,
  onDelete,
  onRetry,
  questionAnswers,
}: {
  deckCards: DeckCardEntry[]
  deckId: string
  deleting: boolean
  error?: string
  loading: boolean
  onDelete: (questionAnswer: QuestionAnswer) => void
  onRetry: () => void
  questionAnswers: QuestionAnswer[]
}) {
  return (
    <section
      className="border-t border-base-300 pt-5"
      aria-labelledby="deck-question-history-title"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="deck-question-history-title" className="flex items-center gap-2 text-lg font-black">
          <Sparkles className="h-5 w-5 text-warning" aria-hidden="true" />
          Saved questions
        </h3>
        {questionAnswers.length ? (
          <span className="text-xs font-bold text-base-content/55">
            {questionAnswers.length} saved
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-3 text-sm text-base-content/65">
          <LoaderCircle
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Loading saved questions…
        </p>
      ) : error ? (
        <div className="rounded-box border border-error/30 bg-error/10 px-4 py-3 text-sm">
          <p className="text-error">{error}</p>
          <Button className="mt-3" size="sm" type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : questionAnswers.length ? (
        <div className="space-y-2" aria-live="polite">
          {questionAnswers.map((questionAnswer, index) => (
            <QuestionHistoryItem
              deckCards={deckCards}
              deckId={deckId}
              deleting={deleting}
              key={questionAnswer.id}
              open={index === 0}
              questionAnswer={questionAnswer}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-box border border-dashed border-base-300 px-4 py-4 text-sm text-base-content/60">
          No saved questions yet. Ask one above to start this deck’s history.
        </p>
      )}
    </section>
  )
}

function QuestionHistoryItem({
  deckCards,
  deckId,
  deleting,
  onDelete,
  open,
  questionAnswer,
}: {
  deckCards: DeckCardEntry[]
  deckId: string
  deleting: boolean
  onDelete: (questionAnswer: QuestionAnswer) => void
  open: boolean
  questionAnswer: QuestionAnswer
}) {
  function requestDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onDelete(questionAnswer)
  }

  return (
    <details className="group rounded-box border border-base-300 bg-base-100" open={open}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold leading-snug">
            {questionAnswer.question}
          </span>
          <time
            className="mt-1 block text-xs text-base-content/55"
            dateTime={questionAnswer.insertedAt}
          >
            {questionDateFormatter.format(new Date(questionAnswer.insertedAt))}
          </time>
        </span>
        <button
          aria-label={`Delete saved question: ${questionAnswer.question}`}
          className="btn btn-ghost btn-square min-h-10 h-10 w-10 shrink-0 text-error"
          disabled={deleting}
          type="button"
          onClick={requestDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-base-content/55 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-base-300 px-4 py-4 sm:px-5">
        {questionAnswer.status === "pending" ? (
          <p className="flex items-center gap-2 text-sm text-base-content/65" role="status">
            <LoaderCircle
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            The AI is working on this question. You can close this dialog and come back later.
          </p>
        ) : questionAnswer.status === "failed" ? (
          <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {questionAnswer.error || "The AI question could not be completed. Try asking again."}
          </p>
        ) : (
          <>
            <DeckMarkdown cardReferences>{questionAnswer.answer}</DeckMarkdown>
            <QuestionRecommendations
              deckCards={deckCards}
              deckId={deckId}
              questionAnswer={questionAnswer}
            />
          </>
        )}
      </div>
    </details>
  )
}
