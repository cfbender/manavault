import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Boxes, Layers, MapPin, Search } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { ActionCard } from "../components/app-shell";
import { CardNameSearchField } from "../components/card-name-search-field";
import { Button } from "../components/ui/button";
import Prism from "../components/prism/Prism";
import { graphql } from "../gql";
import { request } from "../lib/graphql";
import { compactNumber } from "../lib/utils";

const HomeDocument = graphql(`
  query Home {
    homeSummary {
      collectionCount
      locationCount
      deckCount
    }
  }
`);

export function HomePage() {
  const [q, setQ] = useState("");
  const navigate = useNavigate({ from: "/" });
  const { data, isError, isLoading } = useQuery({
    queryKey: ["home"],
    queryFn: () => request(HomeDocument),
  });
  const summary = data?.homeSummary;
  const [renderPrism, setRenderPrism] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const update = () => setRenderPrism(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);


  const value = (count?: number | null) =>
    isLoading ? "..." : isError ? "!" : compactNumber(count);

  function searchCards(value = q) {
    const term = value.trim();
    navigate({ to: "/cards", search: { q: term || undefined } });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    searchCards();
  }

  return (
    <div className="relative z-0 mx-auto max-w-4xl space-y-8">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-0 h-screen w-screen"
      >
        {renderPrism ? (
          <Prism
            animationType="rotate"
            timeScale={0.5}
            height={3.5}
            baseWidth={5.5}
            scale={3.6}
            hueShift={0}
            colorFrequency={1}
            glow={1}
            suspendWhenOffscreen
          />
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-0 h-screen w-screen bg-base-100/55"
      />

      <motion.section
        className="relative z-10 space-y-6 pb-8 pt-3 sm:pb-12 sm:pt-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div>
          <h1 className="max-w-3xl text-5xl font-black tracking-normal sm:text-6xl">
            Your Magic collection, organized.
          </h1>
          <p className="mt-5 text-xl leading-8 text-base-content/70">
            Jump into your collection, build decks, or search the local card
            catalog.
          </p>
        </div>

        <form onSubmit={submitSearch} className="max-w-3xl">
          <div className="fieldset p-0">
            <label
              htmlFor="home-card-search"
              className="fieldset-label text-base"
            >
              Search cards
            </label>
            <div className="control-toolbar grid gap-3 sm:grid-cols-[1fr_auto]">
              <CardNameSearchField
                id="home-card-search"
                name="q"
                value={q}
                onValueChange={setQ}
                onSuggestionSelect={searchCards}
                placeholder="Black Lotus"
              />
              <Button type="submit">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </div>
        </form>
      </motion.section>

      <div className="relative z-10 grid gap-5 md:grid-cols-3">
        <ActionCard
          to="/collection"
          icon={<Boxes className="h-12 w-12 text-accent" />}
          badge={`${value(summary?.collectionCount)} cards`}
          title="Collection"
          description="Browse boxes, binders, lists, and unfiled cards."
        />
        <ActionCard
          to="/decks"
          icon={<Layers className="h-12 w-12 text-warning" />}
          badge={`${value(summary?.deckCount)} decks`}
          badgeTone="accent"
          title="Decks"
          description="Create decks, import lists, and organize zones."
        />
        <ActionCard
          to="/collection"
          icon={<MapPin className="h-12 w-12 text-secondary" />}
          badge={`${value(summary?.locationCount)} locations`}
          badgeTone="secondary"
          title="Locations"
          description="Jump to storage locations and collection import tools."
        />
      </div>
    </div>
  );
}
