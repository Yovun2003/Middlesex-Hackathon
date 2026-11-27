# NouDilo design system

The interface is a water response workspace for Mauritius. One continuous 3D environment carries the geographic and physical detail; a quiet, readable task panel carries the actions. The signature is the camera's guided path through the neighbourhood, with an optional island overview, then to a household, a pipe, a depot, or an actual assignment stage.

## Visual system

The UI uses locally hosted Manrope for headings and Inter for controls and body text. It keeps the NouDilo droplet mark and lagoon-teal identity. The scene uses natural daylight, mineral plaster, stainless steel, charcoal roof tanks, muted vegetation, and ocean colours. The opening uses a full-screen environment, a restrained dark marine overlay, quiet navigation and a reporting drawer. On small screens the introduction has a dark translucent surface to guarantee readable text over moving scenery. Operational task surfaces stay light and restrained so incident state and task content remain readable.

| Role | Token / value |
| --- | --- |
| Primary text | `--ink: #153d3a` |
| Supporting text | `--muted: #526963` |
| Brand | `--teal: #087b6b` |
| Primary action | `--teal-dark: #056254` |
| Active navigation | `--accent: #a64d34` |
| Surface | `--surface: #ffffff` |
| Secondary surface | `--soft: #edf4ef` |
| Dividers | `--line: #d7e3dc` |
| Success | `--success: #216840` |
| Warning | `--warning: #875600` |
| Error | `--error: #a3322d` |
| Information | `--info: #166582` |

The spacing rhythm uses 4, 8, 12, 16, 24, 32, and 48 pixel tokens. Controls use 6 pixel corners; secondary panels use 12. Ordinary actions are at least 44–52 pixels high. Operational values use tabular numbers. Secondary captions are 12–13 pixels; task labels are 14–16 pixels and body text is 16 pixels.

## Layout

On desktop, the task panel occupies 400–480 pixels, widening to about 650 pixels for coordinator operations. The persistent environment occupies the remaining viewport. Both are separate from the header and environment notice. The panel scrolls independently without moving the environment out of view.

Below 900 pixels, navigation moves to a compact second header row. The world occupies a bounded top region and tasks use the remaining viewport with their own scroll area. Reporting dialogs occupy the task region, leaving the world visible above or beside them. Forms never require manipulating the world. Low graphics mode and the 2D map remain available.

## Navigation and components

- Public overview: town choice, direct shortage/leak actions, owned-report tracking, nearby published incidents, and island counts.
- Resident workspace: issue choice, condition, a contextual world cue, report details, review, real saved receipt, and report timeline.
- Coordinator: pending report review, incident register, resource status, notices, audit history, dispatch, publication, and verification.
- Worker: vehicle or crew assignment queue, accepted milestones, actual delivery, operational problems, inspection, work/evidence submission, and pending verification.
- Help: plain-language steps, privacy explanation, and the meaning of the geographic and illustrative layers.

Shared primitives include labelled inputs, native selects, buttons, state badges, inline errors, dialogs, task cards, confirmation forms, timeline entries, data facts, notifications, and `Stage` world cues. `Stage` never mounts a renderer.

## Motion

Normal hover/press feedback is brief and tonal. The GSAP camera director uses an interruptible `power2.inOut` timeline: long travel establishes the village before approaching the task, while short travel moves directly. New destinations cancel prior travel; pause and skip are explicit. Reduced motion applies the final camera pose immediately and removes moving water playback. Demonstration route playback is explicitly labelled and can be paused.

A report confirmation signal starts after the server returns the saved report. It never runs for a rejected submission. Task milestones update the truck's illustrated position; they do not represent GPS. Repair submission preserves a pending state; only independent verification stops the leak visual and publishes a repaired outcome. A symbolic duration indicator never claims a measured tank level.

## Accessible states and data integrity

Focus rings, keyboard-accessible controls, native form validation, review/edit, clear progress, error recovery, real references, and Escape dismissal remain available without WebGL. Loading and unavailable public counts are unknown rather than false zeroes. Public summaries remain distinct from owned reports and private evidence. All layouts retain clear evaluation/development identification where applicable.

The source of truth is the backend's authorised snapshot, not the Zustand visual store. The browser world cannot grant permissions, invent a recorded delivery, verify its own repair, or turn an illustration into a public incident.

Implementation: `src/world/world.css`, `src/world/state.ts`, `src/world/CameraDirector.tsx`, `src/world/WorldScene.tsx`, and the retained workflow components. Asset provenance is documented in `assets.md`; runtime boundaries are documented in `runtime-architecture.md`.

## Updated neighbourhood interaction

Opening or closing the home reporting drawer changes only panel state. Explore removes the introductory copy and exposes the scene's keyboard controls and labelled household, pipe and depot targets. Scene targets are hidden behind the introduction and reporting drawer so that partially obscured targets cannot receive focus. The same neighbourhood stays mounted through sign-in, resident, coordinator and driver work.

Only committed coordinator supply confirmation produces the restored tap. Demo tanker playback adds a camera chase without claiming live GPS. Linked report timestamps come from accepted server events.
