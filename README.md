
# Elunariq Learning Assistant

Elunariq is a portrait-first educational app for high-school students who need help understanding homework one step at a time. The managed mobile app uses Expo Router, React Native, TypeScript, NativeWind, tRPC, AsyncStorage for local preferences/history, and a server-side tutor route that calls the configured LLM provider when available.

## Run the managed mobile app

From the project root:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

The mobile starter uses two listeners: Metro/Web on port `8081` and the API server on port `3000`. Open the Preview from the project dashboard, or connect Expo Go using the generated project QR flow.

For static type checking:

```bash
pnpm check
```

## HTML, CSS, and JavaScript source

The `web/` folder is a plain browser-friendly companion implementation of the main Elunariq flows:

- `web/index.html` contains the semantic shell and navigation.
- `web/styles.css` contains the responsive Notebook Noir design system.
- `web/app.js` contains dashboard, tutor demo, progress, profile, theme, and navigation behavior.

Open `web/index.html` with a static server if you want to inspect the plain HTML/CSS/JavaScript version. The managed mobile app remains the primary deliverable because Mobile Dev uses the fixed Expo/React Native starter.

## Works immediately

The dashboard, subject filters, quick actions, progress view, profile editing, subject and explanation preferences, light/dark theme switcher, tutor conversation UI, guided-mode actions, direct-answer toggle, file selection, and voice recording work in the client. Lesson cards use actual student prompts and activity rather than static sample lessons. Images and PDFs are passed to the configured multimodal model; TXT attachments are decoded and included with the tutor request. Voice notes are sent to the configured transcription service and returned as editable text. Subject-specific schematic diagrams are rendered in chat and included in tutor PDFs. Account registration/sign-in, student progress sync, parent invite codes, and parent progress overview are implemented in the API and require the database migration below. Premium is still a proposed plan and does not charge users.

The tutor calls `assistant.chat` through tRPC. If the configured server-side LLM responds, the UI labels the answer as Live tutor. If the provider is unavailable, times out, returns an empty answer, or rejects the request, the UI uses deterministic, clearly labeled Demonstration mode content instead.

## Configuration and limitations

The app calls the Render backend configured by `EXPO_PUBLIC_API_BASE_URL`; AI provider credentials remain server-side and are never placed in the client bundle. For account features, configure `DATABASE_URL` on the server and apply the checked-in migrations with `pnpm db:migrate`. Set `DATABASE_SSL=true` for public TLS-only MySQL-compatible services such as TiDB Cloud Starter. Account creation currently uses email and password (scrypt password hash) and bearer sessions expire after 30 days. Configure HTTPS and account recovery/email verification before collecting real student accounts. The client stores the session token in AsyncStorage; move it to SecureStore before production native release.

Image/PDF analysis requires a vision/document-capable model configured on the backend. Voice transcription requires `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY`. If either is unavailable, the request reports an error rather than claiming analysis succeeded. The automatic diagrams are topic-based instructional schematics, not exact measurements or proof diagrams.

## Versiunea română și pedagogia Elunariq

Interfața livrată este în română și nu folosește saluturi personalizate artificiale. Tutorul folosește o regulă strictă de dialog: un singur pas, o singură întrebare, apoi așteaptă încercarea elevului. Răspunsurile sunt afișate progresiv în client. În mesajele mobile, notația LaTeX uzuală este convertită într-un fallback cu italic, simboluri și indici Unicode; nu este încă un motor complet de compoziție pentru formule complexe.

Serverul rutează `gpt-5-mini` pentru dialog de rutină, scanare, clasificare și feedback, `gpt-5` pentru răspunsuri extinse și `gpt-5.5` pentru probleme premium foarte lungi. Catalogul live verificat nu expune `gpt-5-pro`, deci Elunariq nu declară că folosește un model indisponibil. Proxy-ul curent nu oferă streaming, iar afișarea lentă este realizată transparent în client după primirea răspunsului.

Elunariq generează o fișă PDF cu noțiunile, formulele și diagramele din sesiunea curentă. PDF-ul folosește MathJax când resursa online este disponibilă și fallback când nu se încarcă. Pe Web, browserul deschide dialogul de printare; pe mobil se folosește partajarea Expo. Formulele complexe și renderizarea offline rămân de îmbunătățit.

În profil apare planul propus de 49,99 lei/lună și beneficiile aflate în validare. Prima săptămână este documentată doar ca interval de 9–19 lei, deci nu este prezentată ca ofertă finală. Checkout-ul, verificarea server-side a drepturilor Premium și restaurarea/anularea achizițiilor trebuie conectate la platformele de billing alese înainte de lansare.

Planul comercial menționat pentru produs este o propunere, nu un checkout activ: 9–19 lei pentru prima săptămână, apoi 49,99 lei/lună. Integrarea plăților nu este activată în această versiune.
=======
# AI-App-Tutor---Romanian-business
..
>>>>>>> 99581132ca397a1aa396c8a6d50d2aeed0f42855
