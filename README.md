# Elunariq Learning Assistant

Elunariq is a portrait-first educational app for high-school students who need help understanding homework one step at a time. The managed mobile app uses Expo Router, React Native, TypeScript, NativeWind, tRPC, the starter Manus OAuth flow, AsyncStorage for local preferences/history, and a server-side tutor route that calls the starter LLM helper when a live provider is available.

## Run the managed mobile app

From the project root:

```bash
pnpm install
pnpm db:push
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

The dashboard, subject filters, lesson cards, quick actions, progress view, profile editing, subject and explanation preferences, light/dark theme switcher, AsyncStorage persistence, tutor conversation UI, guided-mode actions, direct-answer toggle, loading states, and upload validation work without extra credentials. Homework files are shown as selected/ready to send; the app does not pretend that a PDF or image has been analyzed. The profile now presents the proposed Premium plan and its current checkout limitation; no subscription purchase is active.

The tutor calls `assistant.chat` through tRPC. If the configured server-side LLM responds, the UI labels the answer as Live tutor. If the provider is unavailable, times out, returns an empty answer, or rejects the request, the UI uses deterministic, clearly labeled Demonstration mode content instead.

## Configuration and limitations

The server-side tutor uses managed runtime credentials through the starter's existing LLM helper. No API key is placed in the client bundle. A project with a configured Manus service runtime can use live responses; otherwise demo mode is the honest fallback. Real PDF/image understanding would require a storage-backed upload plus a supported file/image analysis pipeline. The current upload UI validates the file and exposes its metadata but does not claim content analysis.

The profile currently stores preferences and learning history on the device. The starter's real Manus OAuth plumbing remains intact, but the profile intentionally tells logged-out users to continue in a connected Preview instead of inventing a local password flow. Voice controls are represented as a permission-aware preference and should be connected to recording/transcription only when the app needs that capability.

## Versiunea română și pedagogia Elunariq

Interfața livrată este în română și nu folosește saluturi personalizate artificiale. Tutorul folosește o regulă strictă de dialog: un singur pas, o singură întrebare, apoi așteaptă încercarea elevului. Răspunsurile sunt afișate progresiv în client. În mesajele mobile, notația matematică uzuală este transformată într-o formă lizibilă, fără delimitatorii LaTeX; aceasta este o alternativă pentru simbolurile comune, nu un motor complet de compoziție matematică.

Serverul rutează `gpt-5-mini` pentru dialog de rutină, scanare, clasificare și feedback, `gpt-5` pentru răspunsuri extinse și `gpt-5.5` pentru probleme premium foarte lungi. Catalogul live verificat nu expune `gpt-5-pro`, deci Elunariq nu declară că folosește un model indisponibil. Proxy-ul curent nu oferă streaming, iar afișarea lentă este realizată transparent în client după primirea răspunsului.

Elunariq generează o fișă PDF cu noțiunile și formulele discutate în sesiunea curentă. În PDF, MathJax typesetează formulele când resursa online este disponibilă; un fallback fără comenzi LaTeX păstrează formula lizibilă când MathJax nu se încarcă. Pe Web, browserul deschide dialogul de printare, de unde elevul poate alege „Save as PDF”. Pentru formulele complexe și randarea fără internet, integrați și livrați motorul de matematică local înainte de lansare. Nota vocală cere permisiunea microfonului; transcrierea reală rămâne dezactivată până când este configurat endpointul de upload și transcriere, iar aplicația spune explicit acest lucru elevului.

În profil apare planul propus de 49,99 lei/lună și beneficiile aflate în validare. Prima săptămână este documentată doar ca interval de 9–19 lei, deci nu este prezentată ca ofertă finală. Checkout-ul, verificarea server-side a drepturilor Premium și restaurarea/anularea achizițiilor trebuie conectate la platformele de billing alese înainte de lansare.

Planul comercial menționat pentru produs este o propunere, nu un checkout activ: 9–19 lei pentru prima săptămână, apoi 49,99 lei/lună. Integrarea plăților nu este activată în această versiune.
