import { useMutation } from "@apollo/client/react"
import { LoaderCircle, Sparkles } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Textarea } from "../../components/ui/textarea"
import { DeckMarkdown } from "./deck-primer"
import { AskDeckQuestionDocument } from "./queries"

export function DeckQuestionDialog({
  deckId,
  deckName,
  onOpenChange,
  open,
}: {
  deckId: string
  deckName: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [askDeckQuestion, questionMutation] = useMutation(AskDeckQuestionDocument)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedQuestion = question.trim()

    if (!trimmedQuestion) {
      setFormError("Enter a question about this deck.")
      return
    }

    setAnswer(null)
    setFormError(null)
    void askDeckQuestion({
      variables: { id: deckId, question: trimmedQuestion },
      onCompleted: (data) => {
        const nextAnswer = data.askDeckQuestion?.answer?.trim()
        if (nextAnswer) setAnswer(nextAnswer)
        else setFormError("The AI provider returned an empty answer. Try asking again.")
      },
      onError: (error) => setFormError(error.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
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
                Answers use the AI provider configured in Settings and are not saved.
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
              <Button type="submit" disabled={!question.trim() || questionMutation.loading}>
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

          {answer ? (
            <section
              className="border-t border-base-300 pt-5"
              aria-labelledby="deck-question-answer-title"
              aria-live="polite"
            >
              <h3
                id="deck-question-answer-title"
                className="mb-4 flex items-center gap-2 text-lg font-black"
              >
                <Sparkles className="h-5 w-5 text-warning" aria-hidden="true" />
                Answer
              </h3>
              <DeckMarkdown>{answer}</DeckMarkdown>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
