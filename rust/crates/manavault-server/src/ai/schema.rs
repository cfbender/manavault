//! AI GraphQL types and root fields (the AI parts of
//! `Schema.Catalog.DeckTypes`, `DeckOperations`, `DeckMutations`,
//! `QueryResolvers`, and `AIOperations`).

use async_graphql::{Context, ID, InputObject, Object, SimpleObject};

use super::analyze_deck::{self, JobProgress};
use super::analyze_deck_list::{self, Args};
use super::answer_deck_question::{self, AskOptions};
use super::question_answers::{self, QuestionAnswer};
use super::requests::{self, DeckAnalysisRequest};
use super::{AiError, decks};
use crate::graphql::relay::{NodeKind, node_int};
use crate::graphql::{Result, internal_error, state, user_error};
use crate::timefmt;

const DECK_NOT_FOUND: &str = "Deck was not found.";

/// `Catalog.get_deck!/1` for resolvers. Elixir raised (an HTTP error
/// response); here a missing deck is a GraphQL error.
async fn require_deck(ctx: &Context<'_>, id: &ID) -> Result<i64> {
    let deck_id = node_int(id, NodeKind::Deck)?;
    match decks::get(&state(ctx).db, deck_id).await {
        Ok(Some(deck)) => Ok(deck.id),
        Ok(None) => Err(user_error(DECK_NOT_FOUND)),
        Err(error) => Err(internal_error(error)),
    }
}

/// `DeckAnalysisJob`: an analysis job's progress.
pub struct DeckAnalysisJob(pub JobProgress);

#[Object]
impl DeckAnalysisJob {
    async fn id(&self) -> ID {
        ID(self.0.id.to_string())
    }

    async fn status(&self) -> &'static str {
        self.0.status.as_str()
    }

    /// Read after the status (`DeckFields.deck_analysis_job_deck/3`), so a
    /// completed job always includes its saved analysis.
    async fn deck(&self, ctx: &Context<'_>) -> Result<crate::decks::Deck> {
        load_deck(ctx, self.0.deck_id).await
    }
}

/// The GraphQL `Deck` by raw id; a deck deleted meanwhile is "Deck was not
/// found." (Elixir's `get_deck!/1` raised).
async fn load_deck(ctx: &Context<'_>, id: i64) -> Result<crate::decks::Deck> {
    crate::decks::Deck::load(&state(ctx).db, crate::decks::DeckId(id))
        .await
        .map_err(internal_error)?
        .ok_or_else(|| user_error(DECK_NOT_FOUND))
}

/// `DeckQuestionAnswer`.
pub struct DeckQuestionAnswer(pub QuestionAnswer);

#[Object]
impl DeckQuestionAnswer {
    async fn id(&self) -> ID {
        ID(self.0.id.to_string())
    }

    async fn conversation_id(&self) -> Option<&str> {
        self.0.conversation_id.as_deref()
    }

    async fn question(&self) -> &str {
        &self.0.question
    }

    async fn answer(&self) -> &str {
        &self.0.answer
    }

    async fn status(&self) -> &'static str {
        self.0.status.as_str()
    }

    async fn error(&self) -> Option<&str> {
        self.0.error.as_deref()
    }

    async fn model(&self) -> Option<&str> {
        self.0.model.as_deref()
    }

    async fn recommended_cuts(&self) -> Vec<String> {
        self.0.recommendation_names("cuts")
    }

    async fn recommended_additions(&self) -> Vec<String> {
        self.0.recommendation_names("additions")
    }

    async fn inserted_at(&self) -> String {
        timefmt::iso8601(&self.0.inserted_at)
    }
}

/// `DeckAnalysisRequest`.
#[derive(SimpleObject)]
#[graphql(name = "DeckAnalysisRequest")]
pub struct DeckAnalysisRequestObject {
    pub id: ID,
    pub source_type: String,
    pub source: String,
    pub source_name: String,
    pub format: String,
    pub analysis: String,
    pub model: String,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
    pub inserted_at: String,
}

impl From<DeckAnalysisRequest> for DeckAnalysisRequestObject {
    fn from(request: DeckAnalysisRequest) -> Self {
        Self {
            id: ID(request.id.to_string()),
            source_type: request.source_type,
            source: request.source,
            source_name: request.source_name,
            format: request.format,
            analysis: request.analysis,
            model: request.model,
            commander_bracket: request.commander_bracket,
            commander_bracket_estimate: request.commander_bracket_estimate,
            commander_bracket_rating: request.commander_bracket_rating,
            inserted_at: timefmt::iso8601(&request.inserted_at),
        }
    }
}

/// `DeckSwapContextInput`: the names staged in the Swap cards workbench.
#[derive(Debug, Clone, InputObject)]
pub struct DeckSwapContextInput {
    pub cuts: Vec<String>,
    pub adds: Vec<String>,
}

/// `AnalyzeDeckPayload`: the analyzed deck and its job.
pub struct AnalyzeDeckPayload {
    pub deck_id: i64,
    pub job: Option<DeckAnalysisJob>,
}

#[Object]
impl AnalyzeDeckPayload {
    async fn deck(&self, ctx: &Context<'_>) -> Result<Option<crate::decks::Deck>> {
        load_deck(ctx, self.deck_id).await.map(Some)
    }

    async fn job(&self) -> Option<&DeckAnalysisJob> {
        self.job.as_ref()
    }
}

#[derive(SimpleObject)]
pub struct AnalyzeDeckListPayload {
    pub deck_analysis_request: Option<DeckAnalysisRequestObject>,
}

#[derive(SimpleObject)]
pub struct AskDeckQuestionPayload {
    pub answer: String,
    pub question_answer: DeckQuestionAnswer,
}

#[derive(SimpleObject)]
pub struct DeleteDeckQuestionAnswerPayload {
    pub question_answer_id: ID,
}

#[derive(SimpleObject)]
pub struct RefreshAllDeckAnalysesPayload {
    pub queued_count: i64,
}

/// `parse_raw_id/1`: a plain integer id.
fn raw_id(id: &ID) -> Result<i64> {
    id.parse()
        .map_err(|_| user_error(format!("Invalid ID: {}", id.as_str())))
}

#[derive(Default)]
pub struct AiQueries;

#[Object]
impl AiQueries {
    /// Saved analyses of pasted or linked decklists, newest first.
    async fn deck_analysis_requests(
        &self,
        ctx: &Context<'_>,
        limit: Option<i64>,
    ) -> Result<Vec<DeckAnalysisRequestObject>> {
        let requests = requests::list(&state(ctx).db, limit)
            .await
            .map_err(internal_error)?;
        Ok(requests.into_iter().map(Into::into).collect())
    }

    async fn deck_analysis_job(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
    ) -> Result<Option<DeckAnalysisJob>> {
        let deck_id = node_int(&deck_id, NodeKind::Deck)?;
        let job = analyze_deck::latest_job(&state(ctx).db, deck_id)
            .await
            .map_err(internal_error)?;
        Ok(job.map(DeckAnalysisJob))
    }

    async fn deck_question_answers(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        #[graphql(
            desc = "Return the turns of one Swap cards chat thread instead of Ask AI history."
        )]
        thread_id: Option<String>,
    ) -> Result<Vec<DeckQuestionAnswer>> {
        let deck_id = require_deck(ctx, &deck_id).await?;
        let pool = &state(ctx).db;
        let answers = match thread_id {
            Some(thread_id) => question_answers::list_thread(pool, deck_id, &thread_id).await,
            None => question_answers::list_for_deck(pool, deck_id).await,
        }
        .map_err(internal_error)?;
        Ok(answers.into_iter().map(DeckQuestionAnswer).collect())
    }
}

#[derive(Default)]
pub struct AiMutations;

#[Object]
impl AiMutations {
    async fn refresh_all_deck_analyses(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<RefreshAllDeckAnalysesPayload>> {
        let count = analyze_deck::refresh_all(state(ctx))
            .await
            .map_err(AiError::into_graphql)?;
        Ok(Some(RefreshAllDeckAnalysesPayload {
            queued_count: i64::try_from(count).unwrap_or(i64::MAX),
        }))
    }

    async fn analyze_deck(&self, ctx: &Context<'_>, id: ID) -> Result<Option<AnalyzeDeckPayload>> {
        let deck_id = require_deck(ctx, &id).await?;
        let job = analyze_deck::enqueue(state(ctx), deck_id)
            .await
            .map_err(AiError::into_graphql)?;
        Ok(Some(AnalyzeDeckPayload {
            deck_id,
            job: Some(DeckAnalysisJob(job)),
        }))
    }

    async fn analyze_deck_list(
        &self,
        ctx: &Context<'_>,
        url: Option<String>,
        text: Option<String>,
        format: String,
    ) -> Result<Option<AnalyzeDeckListPayload>> {
        let request = analyze_deck_list::run(state(ctx), &Args { url, text, format })
            .await
            .map_err(AiError::into_graphql)?;
        Ok(Some(AnalyzeDeckListPayload {
            deck_analysis_request: Some(request.into()),
        }))
    }

    async fn ask_deck_question(
        &self,
        ctx: &Context<'_>,
        id: ID,
        question: String,
        conversation_id: Option<String>,
        thread_id: Option<String>,
        swap_context: Option<DeckSwapContextInput>,
    ) -> Result<Option<AskDeckQuestionPayload>> {
        let deck_id = require_deck(ctx, &id).await?;
        let options = AskOptions {
            conversation_id,
            thread_id,
            swap_context: swap_context.map(|context| (context.cuts, context.adds)),
        };
        let saved = answer_deck_question::enqueue(state(ctx), deck_id, &question, &options)
            .await
            .map_err(AiError::into_graphql)?;
        Ok(Some(AskDeckQuestionPayload {
            answer: saved.answer.clone(),
            question_answer: DeckQuestionAnswer(saved),
        }))
    }

    async fn delete_deck_question_answer(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteDeckQuestionAnswerPayload>> {
        let id = raw_id(&id)?;
        let pool = &state(ctx).db;
        let Some(saved) = question_answers::get(pool, id)
            .await
            .map_err(internal_error)?
        else {
            return Err(user_error("Saved question was not found."));
        };
        question_answers::delete(pool, saved.id)
            .await
            .map_err(internal_error)?;
        Ok(Some(DeleteDeckQuestionAnswerPayload {
            question_answer_id: ID(saved.id.to_string()),
        }))
    }
}
