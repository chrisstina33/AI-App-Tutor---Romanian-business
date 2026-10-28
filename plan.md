# Elunariq Learning Assistant — Implementation Plan

## Product scope
Elunariq is a portrait-first learning companion for high-school students. The MVP focuses on four connected flows: a calm dashboard for choosing what to study, a guided AI tutor that emphasizes hints and reasoning, a progress view for lessons and goals, and a profile/settings surface for preferences and theme. Authentication remains the starter's real Manus OAuth flow; the app makes no fake password claims. When the configured server-side LLM is available, tutor requests use it through tRPC. When it is unavailable, the UI switches to a clearly labeled demonstration mode with deterministic, pedagogically framed example responses.

## Implementation approach

- Preserve the fixed Expo Router / React Native / TypeScript / NativeWind starter and its existing OAuth, tRPC, database, and runtime setup.
- Build reusable primitives in `components/` for the Elunariq wordmark, cards, icon buttons, progress rings/bars, subject pills, tutor message cards, and bottom tab affordances.
- Keep app data and copy in small typed modules under `lib/` and `services/` so the screens remain readable and maintainable.
- Add a server-side tutor procedure that calls the starter's existing server LLM helper without exposing credentials to the native or web bundle. The client service normalizes live responses and falls back to a clearly labeled demo provider on timeout, missing credentials, empty content, or upstream errors.
- Persist theme, display name, preferred subjects, learning level, explanation style, saved lessons, and completed exercise count with AsyncStorage. The UI labels this data as “Saved on this device” until a server-backed profile table is added.
- Use the existing Manus OAuth hook for account state and a simple logged-out state that points to the real OAuth action. Do not store passwords or simulate secure email/password auth.
- Support homework file selection through a platform-safe document/image picker abstraction. Validate PDF/TXT/PNG/JPG and a 10 MB limit, show the selected filename, and explicitly distinguish “ready to send” from “analyzed”. Actual PDF/image analysis remains a documented server/storage follow-up unless a supported public file URL is available.
- Add accessible empty/loading/error states, keyboard-dismiss-friendly inputs, haptic feedback on primary actions, and compact modal sheets for search, tutor controls, and profile editing.

## Project structure

- `app/_layout.tsx`: app providers, runtime initialization, and stack registration.
- `app/(tabs)/_layout.tsx`: four-tab navigation and theme-aware tab styling.
- `app/(tabs)/index.tsx`: Home/dashboard.
- `app/(tabs)/tutor.tsx`: guided tutor chat, quick actions, subject/agent controls, and upload affordance.
- `app/(tabs)/progress.tsx`: learning goal, subject progress, recent lessons, and revision card.
- `app/(tabs)/profile.tsx`: profile, preferences, storage disclosure, OAuth/logout, and theme switcher.
- `components/`: reusable Elunariq UI primitives and tutor/file-upload components.
- `constants/theme.ts` and `theme.config.ts`: deep navy/violet palette and semantic tokens.
- `lib/storage.ts`: typed AsyncStorage persistence for app preferences and learning history.
- `lib/app-data.ts`: typed demo content, subjects, recommendations, and lesson metadata.
- `services/ai-service.ts`: provider abstraction, guided-learning prompts, demo fallback, and normalized response types.
- `server/ai.ts` and `server/routers.ts`: server-only tutor procedure using the starter LLM helper and explicit error semantics.
- `README.md`: exact run commands, working-now features, configuration requirements, and limitations.

## Design direction

### Considered styles

- **Notebook Noir / 0.07** — editorial study surfaces, ink-dark navy, violet marker highlights, and quiet paper-like cards.
- **Orbit Study Club / 0.04** — energetic orbital gradients and playful science-lab motion.
- **Quiet Signal / 0.06** — near-monochrome focus UI with one electric accent and sparse information density.

### Chosen style: Notebook Noir

**Design Movement:** editorial learning tools inspired by annotated notebooks, modern student planners, and dark academic dashboards.

**Core Principles:** progress should feel visible but never stressful; every action should lead to a next thought; information is chunked into calm, scannable cards; and system feedback should be specific rather than decorative.

**Color Philosophy:** deep navy creates a focused evening-study atmosphere; warm white keeps long reading comfortable; violet is the ownable “thinking spark” used for progress and primary actions; mint and amber are reserved for learning states, not decoration.

**Layout Paradigm:** an asymmetric vertical study stream. The top of each screen anchors the student's current intention, while cards step down into focused actions, recent work, and optional depth. Avoid dense centered grids; use a wide lead card followed by compact horizontal clusters.

**Signature Elements:** a small violet “spark” mark in the wordmark; pill-shaped progress labels that read like notebook annotations; and tutor cards with a violet left rail for hints versus an amber rail for “try this next”.

**Interaction Philosophy:** default to guidance rather than disclosure. Tutor actions are framed as “Hint”, “Explain”, and “Try an example”, with complete solutions behind an intentional action. Taps use subtle scale/opacity changes and haptics where available.

**Animation:** 160–220 ms ease-out transitions; progress bars fill once on mount; message cards fade/slide upward by a few pixels; no looping animation except a tiny breathing state while an AI response is pending. Respect reduced motion on Web where possible.

**Typography System:** use the starter's system sans for reliable native rendering; use weight and letter spacing to create hierarchy. 30–32 px semibold editorial headlines, 20 px semibold section titles, 16 px medium card titles, and 13–14 px muted supporting copy.

**Brand Essence:** Elunariq is a gentle study co-pilot for students who want to understand the next step, not just copy the answer. Personality: observant, encouraging, clear.

**Brand Voice:** short, specific, non-judgmental, and action-oriented. Example lines: “Let’s find the idea behind the question.” “You’re one step away—try substituting the values first.”

**Wordmark & Logo:** a lowercase `elunariq` wordmark paired with a four-point violet spark that suggests a concept clicking into place. The launcher icon uses the same spark on a deep navy square without baked-in rounded corners.

**Signature Brand Color:** Elunariq Violet `#8A72FF`.

## Schimbare de produs — versiunea română

Interfața principală și tutorul sunt în limba română. Dashboardul nu folosește nume personale sau formule de salut artificiale. Textele sunt scurte, neutre și orientate spre acțiune.

Tutorul adoptă o pedagogie socratică inspirată de bunele practici publice observate la Astra AI: problemă fotografiată sau încărcată, explicație pas cu pas, întrebări de verificare, practică și răspuns complet la cerere. Elunariq se diferențiază prin regula „un singur pas și o singură întrebare pe mesaj”, afișare progresivă fără streaming pretins, formule în notație LaTeX și cererea explicită a încercării elevului înainte de următorul pas.

Model routing-ul este server-side: `gpt-5-mini` pentru dialog de rutină, scanare și clasificare, `gpt-5` pentru răspunsuri extinse sau probleme cu risc de inconsistență, iar modelul premium din catalogul live este `gpt-5.5` pentru probleme lungi și dificile. Catalogul live verificat nu oferă în prezent un model `gpt-5-pro`, de aceea aplicația nu îl pretinde disponibil.

Au fost adăugate exportul conversației în PDF, recapitularea săptămânală în PDF, disclosure pentru voce și transcriere, profil cu rol elev/părinte, nivel/clasă, avatar editabil și preferințe de accesibilitate. Când un serviciu de transcriere sau analiză a imaginilor nu este configurat, aplicația declară limita și nu simulează analiza.
