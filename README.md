
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

The dashboard, subject filters, quick actions, progress view, profile editing, subject and explanation preferences, light/dark theme switcher, tutor conversation UI, guided-mode actions, direct-answer toggle, file selection, and voice recording work in the client. A short diagnostic records class, level, priority subjects, and responses locally; student accounts sync those preferences with learner progress. Tutor chats can be created, switched, renamed, and deleted, and saved lessons are clearly labeled as on-device data. Images and PDFs are passed to the configured multimodal model; TXT attachments are decoded and included with the tutor request. Voice notes are sent to the configured transcription service and returned as editable text. Tutor output uses validated structured JSON for diagram interpretation. Geometry is laid out from semantic points and relationships; chemistry uses a validated molecular graph and deterministic bond layout, including branched one-ring structures. Account registration/sign-in, student progress sync, parent invite codes, parent signup with an optional supervision code, and parent progress overview require the database migrations below. Education-center representatives with accounts can submit applications in-app; visitors can also prepare an inquiry without an account, which opens a prefilled email that they must send themselves. An administrator approves in-app applications before the private center space activates. Active centers upload PDF, TXT, PNG, and JPG resources, manage student access codes, choose between automatic and approval-based student join requests, review pending requests, and see enrolled students. Students can discover active centers, request membership, and open center materials; access codes continue to enroll students directly. These flows require migrations `0004_education_spaces.sql` and `0005_center_join_requests.sql`, an administrator account, and the configured Forge storage service. Premium card checkout is available on web to a parent account linked to exactly one student; active access is granted from verified Stripe webhooks. Center billing and enrollment limits are not automated.

The tutor calls `assistant.chat` through tRPC and routes requests through OpenRouter: low complexity uses `openai/gpt-5-mini`, medium uses `openai/gpt-5`, and high-complexity or visual requests use `openai/gpt-5.5` for the pilot. Model slugs are configured with the `OPENROUTER_MODEL_*` variables. Medium/high requests require an active Premium subscription; routine low-complexity tutoring remains available without it. Failed model calls or invalid structured responses try the next configured model and the UI reports which model answered. Geometry, molecular structures, balanced stoichiometric equations, and schematic physics drawings use validated SVG output; mathematical geometry figures are suppressed for physics and chemistry responses. Diagrams are generated from the current question rather than copied from earlier turns. If all configured models fail, the app reports the error rather than claiming a demonstration answer is live. On Web, PDF export opens the browser print dialog so the learner can save the sheet as a PDF; native platforms use the system print/share flow.

## Configuration and limitations

The app calls the Render backend configured by `EXPO_PUBLIC_API_BASE_URL`; AI provider credentials remain server-side and are never placed in the client bundle. The deployed Vercel origin is allowlisted for browser API requests. If you use another Vercel deployment or a custom domain, add its exact origin (for example, `https://app.example.com`, without a trailing slash) to `CORS_ALLOWED_ORIGINS` on the API service. Native requests do not use browser CORS.

For account features, configure `DATABASE_URL` or all five `DATABASE_*` fields on the API service and apply the checked-in migrations with `pnpm db:migrate`. Set `DATABASE_SSL=true` for public TLS-only MySQL-compatible services such as TiDB Cloud Starter. A local `.env` does not configure the deployed API. If account access reports `ER_ACCESS_DENIED_ERROR`, verify the database username, password, and grants with the database provider. Account creation currently uses email and password (scrypt password hash) and bearer sessions expire after 30 days. Configure HTTPS and account recovery/email verification before collecting real student accounts. The client stores the session token in AsyncStorage; move it to SecureStore before production native release.

For web subscriptions, configure `APP_BASE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` on the API server. In Stripe, register `https://<api-host>/api/billing/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`; the server verifies the Stripe signature and records subscription state in MySQL. The checkout creates a recurring monthly card subscription of 29 RON for one linked student and returns to the profile with a payment-result status. Enable Stripe's customer portal so parents can manage or cancel it. Configure and test checkout, portal, and webhook with test keys before using live keys. Card details are handled by Stripe and are never stored in the app database. Mobile-app billing is intentionally unavailable in this pilot.

Image/PDF analysis requires a vision/document-capable model configured on the backend. Voice transcription requires `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY`. If either is unavailable, the request reports an error rather than claiming analysis succeeded. Diagram layouts are schematic unless the exercise supplies the required measurements; an unrecognized or invalid structure is omitted instead of being guessed. The chemistry renderer supports connected neutral molecules made from C, N, O, P, S, F, Cl, Br, and I, with acyclic structures and one ring, including side chains.

## Versiunea română și pedagogia Elunariq

Interfața livrată este în română și nu folosește saluturi personalizate artificiale. Tutorul folosește o regulă strictă de dialog: un singur pas, o singură întrebare, apoi așteaptă încercarea elevului. Mesajul este afișat după primirea răspunsului; aplicația nu pretinde că transmite tokenuri în timp real. În mesajele mobile, formulele și matricile uzuale sunt convertite într-un fallback cu simboluri și indici Unicode; PDF-ul folosește typesetting MathJax când resursa este disponibilă.

Serverul rutează prin OpenRouter: `openai/gpt-5-mini` pentru întrebări simple, quizuri standard și ghidare socratică; `openai/gpt-5` pentru explicații complexe și probleme în mai mulți pași; `openai/gpt-5.5` pentru materiale complexe și diagrame în pilot. Cererile medium/high sunt rezervate unui abonament Premium activ. Proxy-ul curent nu oferă streaming și nu simulează afișarea token cu token.

Elunariq generează o fișă PDF cu noțiunile, formulele și diagramele din sesiunea curentă. Interpretarea desenelor este transmisă ca JSON structurat și validat; geometria și grafurile moleculare primesc layout și SVG deterministe, marcate schematic când nu sunt reprezentate la scară. PDF-ul folosește MathJax când resursa online este disponibilă și fallback când nu se încarcă. Pe Web, browserul deschide dialogul de printare; pe mobil se folosește partajarea Expo.

În profil, abonamentul Premium este 29 lei/lună pentru un singur elev asociat contului părintelui. În pilot, checkout-ul cu cardul este disponibil numai pe web; accesul Premium este actualizat din evenimente Stripe semnate, iar părintele poate administra/anula abonamentul din portalul Stripe. Aplicațiile native nu colectează plăți. Centrele educaționale pot solicita acces, iar un administrator aprobă cererea înainte de activarea spațiului; reprezentantul centrului poate alege înscriere automată sau cu aprobare pentru solicitările elevilor, iar codurile de acces rămân disponibile. Încărcarea materialelor necesită configurarea Forge Storage. Planul, locurile și facturarea instituțională trebuie stabilite separat.

Nu există perioadă de probă în checkout-ul pilot. Stripe trebuie configurat și testat cu chei de test, webhook-ul și baza de date înainte de activarea plăților live.
