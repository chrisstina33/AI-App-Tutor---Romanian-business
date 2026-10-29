# Elunariq Implementation TODO

## 1. Ship the Elunariq visual system and mobile shell

- [x] Use the fixed Expo Router / React Native / TypeScript / NativeWind starter.
- [ ] Use deep navy, violet, white, and subtle gradients with rounded cards, soft shadows, smooth transitions, subtle animations, and accessible contrast.
- [ ] Keep the experience portrait-first and comfortable for one-handed use on mobile, while remaining usable on Expo Web.
- [ ] Add a compact, theme-aware four-tab navigation: Home, Tutor, Progress, Profile.
- [ ] Replace starter branding with the Elunariq spark wordmark and a distinct square launcher icon without baked-in rounded corners.
- [ ] Provide visible focus/pressed states, loading indicators, empty states, success messages, and actionable error copy.

## 2. Deliver the personalized learning dashboard

- [ ] Show a welcome message, current learning focus, search affordance, subject selector, recent learning sessions, progress indicators, recommended topics, daily goal, and revision section.
- [ ] Provide working quick actions to start an AI tutoring session, upload homework, and review previous lessons.
- [ ] Clearly distinguish demonstration data from actual saved user data.
- [ ] Include realistic sample content only where needed to make the MVP understandable.

## 3. Deliver guided AI tutoring

- [ ] Provide chat history/session context, a conversation area, message input, send action, subject selector, tutor/agent selector, homework upload, and the actions Give me a hint, Explain the concept, Show an example, Check my answer, Generate practice questions, and Summarize this lesson.
- [ ] In guided mode identify subject/concepts, explain what the problem asks, highlight keywords/formulas/theories, provide an initial hint, guide manageable steps, ask for the next attempt, explain mistakes constructively, and reveal a complete solution only when requested or pedagogically appropriate.
- [ ] Add an explicit direct-answer mode rather than revealing complete solutions by default.
- [ ] Render tutor responses as structured message cards with headings, bullets, numbered steps, key concepts, examples, practice exercises, and expandable detail where useful.
- [ ] Show a clear live-provider/demo-mode status and never claim a file or answer was analyzed when it was not.

## 4. Add the modular AI and upload services

- [ ] Keep AI communication separate from UI code with configurable subject/mode prompts, session history, loading/error/timeout/empty handling, and provider switching.
- [ ] Route live AI calls through server-side credentials only; do not expose API keys in browser-side or native bundle code.
- [ ] Provide a deterministic, clearly labeled demonstration provider when live LLM configuration or a usable response is unavailable.
- [ ] Validate homework types PDF, TXT, PNG, and JPG plus a 10 MB size limit; show selected file name/type, processing state, removal before submission, and clear unsupported-file errors.
- [ ] Explain the fallback limitation when actual PDF/image contents are not processed instead of fabricating analysis.

## 5. Add profile, auth state, persistence, and preferences

- [x] Keep login disabled; the app does not depend on Manus hosting or OAuth.
- [ ] Let students view/edit display name, choose preferred subjects, select learning level, choose explanation style, review saved lessons, track completed exercises, view learning progress, and configure basic app preferences.
- [ ] Persist preferences and learning history using available device storage, with a clear “Saved on this device” disclosure.
- [ ] Add light/dark/system theme controls.
- [ ] Add optional voice controls only with permission-aware native/browser fallback messaging.

## 6. Verify and document the delivered MVP

- [ ] Run TypeScript diagnostics and project checks after implementation; fix actionable errors.
- [ ] Start both required Mobile listeners (Metro 8081 and API 3000) and verify the Preview is no longer the placeholder.
- [ ] Verify core interactions by code inspection and focused Preview checks: tab navigation, tutor quick actions, send flow, upload validation/removal, profile editing, theme switching, persistence, and logout entry point.
- [ ] Document architecture, exact local run commands, features that work immediately, external/API configuration requirements, and known limitations in README.md.

## Versiunea română și ghidarea socratică

- [x] Interfața mobilă și companionul HTML/CSS/JavaScript folosesc limba română, elimină saluturile cu nume fictive și nu folosesc emoji-uri în copy.
- [x] Tutorul lucrează cu un singur pas și o singură întrebare pe mesaj, afișează răspunsul progresiv și ține răspunsul complet în spatele unei cereri explicite.
- [x] Tutorul folosește formule LaTeX în răspunsurile demonstrative și explică faptul că răspunsul complet nu apare automat.
- [x] Model routing-ul este server-side: `gpt-5-mini` pentru rutină, `gpt-5` pentru răspunsuri extinse și `gpt-5.5` pentru probleme premium lungi; `gpt-5-pro` rămâne neactiv deoarece nu apare în catalogul live verificat.
- [x] Utilizatorul poate genera PDF pentru conversația tutorului și recapitularea săptămânală, cu formule LaTeX păstrate ca text de lucru.
- [x] Profilul include rol elev/părinte, nivel, stil de explicație, preferințe de materii, temă, avatar editabil cu disclosure și stocare locală declarată.
- [ ] Uploadul de imagine/PDF trebuie conectat la stocare și analiză multimodală reală înainte ca aplicația să pretindă că a scanat conținutul.
- [ ] Vocea trebuie conectată la upload audio și transcriere server-side; UI-ul și disclosure-ul sunt livrate, dar aplicația nu pretinde transcriere când serviciul lipsește.
- [ ] Checkout-ul pentru planul propus 9–19 lei în prima săptămână și 49,99 lei/lună nu este încă activat.
