# Lessons

## 2026-06-16 - Mirror Existing Components When Requested

**Category**: Communication
**Context**: I replaced the `/collection` owned-cards table with a new custom card tile after the user asked for an infinite-scroll card view.
**Mistake**: I created a similar but different UI instead of matching the existing location-view card component and its actions/options.
**Correction**: Reuse or closely mirror the referenced component markup, event names, helper semantics, and modal behavior when the user asks for the same exact component or same options.
**Rule**: When asked for the “same component,” compare against the referenced view and preserve secondary actions, dropdowns, overlays, empty/no-image states, and modal close/switch/delete flows before inventing new UI.
**Related Patterns**: `/collection` owned cards should mirror the location card image tile, details overlay, Edit/Change printing/Delete menu, and details/change-printing modals.
