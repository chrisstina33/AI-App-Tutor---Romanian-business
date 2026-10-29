# Audit de lansare Elunariq

Data auditului: 27 octombrie 2026  
Sursă analizată: versiunea din `bionis (2).zip`, împreună cu `README.md`, `TODO.md`, `plan.md`, `Research sources — Romanian guided homework MVP.md` și `cost-calculator.mjs`.

## Verdict

Proiectul este un prototip MVP coerent, cu o direcție vizuală și pedagogică recognoscibilă. Nu este încă pregătit pentru lansare comercială. Interfața și demonstrațiile funcționează pentru explorare, însă plata, analiza temelor încărcate, istoricul sincronizat și o parte din fluxurile companionului web nu sunt servicii reale. Etichetele și paginile produsului trebuie să păstreze aceste distincții până la integrarea backend-ului.

## Ce spun materialele de referință

- Prezentarea definește problema elevilor de liceu: explicații greu de găsit, meditații costisitoare, resurse video generice și riscul ca răspunsurile AI să nu fie corecte ori aliniate programei. Poziționarea propusă este tutor AI ghidat, recapitulări PDF, nivel adaptat și identificarea lacunelor.
- Codul acoperă tutorul și o parte din export/progres; adaptarea pe nivel, diagnosticul lacunelor și feedback-ul de test sunt încă parțiale sau demonstrative. Prezentarea menționează și generare de desene, funcție care nu există în MVP-ul arhivat.
- Slide-urile despre interviuri, analiza pieței și costuri conțin puncte de lucru, nu rezultate validate. Nu le-am tratat ca fapte sau instrucțiuni de implementare.
- Lista de research oferă surse pentru verificări ulterioare, nu un tabel curent de prețuri sau o confirmare a concurenților. Costurile din calculator sunt ipoteze datate și trebuie actualizate înainte de o decizie de preț.

## Ce funcționează acum

- Aplicația Expo are ecrane pentru dashboard, tutor, progres și profil, cu navigare și texte în română.
- Tema întunecată/luminoasă și paleta Elunariq sunt implementate prin tokenuri de culoare; profilul oferă preferințe de temă. Culorile nu sunt „blocate”, dar nu există editor liber de paletă.
- Tutorul poate apela procedura server-side `assistant.chat` dacă runtime-ul are furnizor AI configurat. Cheile nu sunt puse în client. Dacă serviciul nu răspunde, aplicația afișează un răspuns demonstrativ etichetat ca atare.
- Sunt prezente acțiuni de ghidare, selector de materie și stil, mesaje de încărcare și o opțiune explicită pentru răspuns complet.
- Preferințele de profil sunt salvate local pe dispozitiv. Asta nu înseamnă cont cu sincronizare între dispozitive.
- Selectarea fișierelor are validări și este prezentată drept fișier pregătit. Aplicația nu susține că i-a citit conținutul.
- Sunt prevăzute exporturi PDF pentru conversație și progres săptămânal.

## Ce este demonstrativ sau incomplet

| Zonă | Starea din cod | Ce lipsește pentru lansare |
|---|---|---|
| Abonament | Profilul afișează acum planul Premium propus la 49,99 lei/lună, cu beneficiile și limita de billing explicate. | Checkout, produse configurate în magazine, verificarea tranzacțiilor pe server, drepturile Premium, restaurarea achizițiilor și anularea sunt încă neconectate. Perioada de probă și prețul exact trebuie confirmate. |
| PDF | Tutorul generează acum o fișă din explicațiile și formulele conversației curente. MathJax este folosit în PDF când e online, iar Web deschide o fereastră dedicată de printare. | Nu există încă o bibliotecă de fișe teoretice pe materii și capitole. Fallback-ul pentru formule complexe este aproximativ, iar aspectul PDF trebuie verificat pe iOS, Android și Web. |
| Formule în tutor | Mesajele mobile convertesc notația uzuală în caractere matematice fără delimitatori LaTeX; am verificat manual exemple simple pentru puteri, fracție și implicație. | Converterul este un fallback pentru simboluri uzuale, nu un motor complet LaTeX. Formulele cu matrici, integrale, aliniere și structuri complexe au nevoie de randare nativă dedicată. |
| Upload și voce | Alegerea fișierului/înregistrarea locală și mesajele despre limitări sunt prezente. | Nu există analiză reală a documentului/imaginii și nici trimiterea/transcrierea notei vocale. Nu trebuie promovate drept scanare sau dictare funcțională. |
| Autentificare | Loginul este dezactivat; preferințele și progresul rămân pe dispozitiv. | Nu există conturi sau sincronizare între dispozitive. Pentru login va trebui ales și integrat separat un furnizor de autentificare. |
| Web companion | Copia HTML are tutorial, temă, quiz și formulare. | Autentificarea este demo local; formularul de contact doar confirmă pregătirea mesajului; quiz-ul este foarte mic, iar tutorul web este determinist și demonstrativ. Nu este echivalent funcțional cu aplicația Expo. |
| Progres | Sunt afișate carduri, lecții și recapitulare. | O parte din date sunt statice/demonstrative; trebuie etichetate și alimentate din activitatea elevului înainte să fie prezentate ca progres real. |
| Cost AI | Există un calculator orientativ. | Calculatorul folosește prețuri capturate la 9 octombrie 2026 și include `gpt-5-pro`, în timp ce README-ul spune că routerul folosește `gpt-5.5` și că `gpt-5-pro` nu este disponibil. Costul per elev trebuie recalculat cu modelul, utilizarea și tarifele reale înainte să fixați prețul abonamentului. |

## Modificări făcute în această rundă

- Mesajele tutorului afișează formulele uzuale fără delimitatorii `\\( ... \\)`. Sunt formate cu italic și simboluri lizibile; fracțiile, puterile, radicalii și operatorii simpli au fallback Unicode.
- Butonul din tutor produce o fișă de recapitulare cu explicațiile AI din sesiunea curentă, formulele extrase și un pas de exersat. PDF-ul folosește MathJax când conexiunea la resursa CDN reușește și fallback lizibil când nu reușește. Web deschide dialogul de printare; iOS/Android folosesc partajarea Expo.
- Profilul arată planul Premium și prețul lunar propus, cu perioada de probă încă nefinalizată și fără checkout activ. Cardul nu activează un abonament și nu colectează plăți.
- README-ul a fost actualizat ca să descrie clar aceste limite.

### Problemă concretă în exportul PDF

Escaparea HTML care împiedica randarea formulelor a fost înlocuită cu procesare separată a textului și a expresiilor matematice. În Web, PDF-ul este oferit prin dialogul de printare al browserului; pe mobil, PDF-ul este partajat prin API-ul Expo. Dacă fereastra Web este blocată sau partajarea mobilă nu e disponibilă, operația arată o eroare. Rămâne de verificat vizual după instalarea dependențelor și rularea pe dispozitive.

## Abonamentul recomandat pentru produs

Separă trei lucruri în implementare:

1. **Ecranul de planuri:** beneficii concrete, preț localizat, durată de probă, data și valoarea primei reînnoiri, anulare și termeni. Păstrează planul gratuit util.
2. **Drepturile contului:** serverul trebuie să decidă dacă accesul Premium este activ; nu este suficient un `isPremium` salvat pe telefon.
3. **Plata pe platformă:** pentru funcții digitale cumpărate în aplicație, Apple cere în mod obișnuit In-App Purchase, iar Google Play cere Play Billing, cu excepțiile și programele regionale prevăzute de politicile lor. Pe web se poate alege separat un procesator. Verificați regulile actuale înainte de publicare: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) și [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

Prețul de 49,99 lei/lună și prima săptămână la 9–19 lei sunt doar o ipoteză din TODO, nu o ofertă activă. Înainte de a o afișa drept ofertă, decideți un preț exact, durata de probă, eligibilitatea, reînnoirea și fluxul de cumpărare pentru părinte. Apple cere o poartă pentru părinți când aplicațiile din Kids Category oferă oportunități de cumpărare; verificați și categoria de vârstă aleasă și regulile actuale ale fiecărui magazin. Pentru datele elevilor, stabiliți vârsta vizată, temeiul de prelucrare, consimțământul unde este necesar, retenția și ștergerea datelor; EDPB recomandă informații clare, ușor de înțeles și potrivite vârstei ([EDPB: Children](https://www.edpb.europa.eu/topics/key-gdpr-concepts/children_en)).

## PDF și matematică: criterii de acceptare

- Elevul poate alege materia și tema și obține o fișă structurată: noțiuni, definiții, formule, exemplu lucrat, greșeli frecvente și exercițiu de recapitulare.
- Formulele din chat și PDF sunt randate vizual. Nu apar `\\`, `frac`, acolade sau delimitatori LaTeX în textul destinat elevului.
- Randarea acoperă fracții, puteri, indici, radicali, paranteze și simbolurile folosite în materiile efectiv lansate; formulele rămân lizibile și la export/print.
- PDF-ul include diacritice românești, titlu, materie, dată, paginare și spațiere testată pe telefon și desktop.
- Dacă randarea sau partajarea eșuează, interfața arată o eroare reală, nu mesajul de succes.
- Exportul este verificat vizual în PDF-uri generate pe Android, iOS și Web, nu doar prin inspectarea textului HTML.

Recomandare tehnică: folosiți același motor de randare matematică în mesajele tutorului și în HTML-ul PDF, cu o alternativă locală/fallback pentru lipsa rețelei. Nu convertiți LaTeX cu înlocuiri superficiale în Unicode; asta cedează la fracții, matrici și formule mai complexe.

## Culori și finisaj vizual

Direcția „Notebook Noir” și tokenurile de culoare există. Următorul pas nu este să adăugați multe culori, ci să impuneți tokenuri semantice comune pe mobil și web, să verificați contrastul în ambele teme și să eliminați stilurile hardcodate care sar peste paletă. Tranzițiile decorative din companionul web nu compensează diferențele funcționale dintre web și mobil. Pentru a nu părea un demo generat rapid, standardizați tipografia, spațierea, stările goale/eroare, formularele reale și microcopy-ul în toate ecranele.

## Ordinea de lucru înainte de pilot

1. Alegeți suprafața de lansare inițială: Expo Web, Android, iOS sau toate trei.
2. Închideți decizia de preț, perioada de probă și cumpărătorul abonamentului (elev sau părinte); apoi alegeți integrarea de billing potrivită distribuției.
3. Finalizați randarea LaTeX și PDF-ul de teorie, cu verificare vizuală pe dispozitive.
4. Decideți dacă pilotul permite numai text sau și analiza reală a fișierelor; până atunci păstrați copy-ul actual de limitare.
5. Publicați politica de confidențialitate, retenția/ștergerea datelor și fluxul aplicabil elevilor minori înainte de colectarea datelor reale.
6. Automatizați typecheck, lint, teste de servicii și smoke checks pentru autentificare, tutor, PDF, temă, upload și billing; apoi faceți testare manuală pe Android/iOS/Web.

## Limită de verificare

Verificare tehnică efectuată: `tsc --noEmit` a trecut, ESLint a trecut pe fișierele modificate, 25 de teste CORS au trecut, iar testul OAuth a fost sărit. Cele două teste adăugate pentru formatterul matematic au trecut. Instalarea dependențelor a folosit `--frozen-lockfile`, deci lockfile-ul proiectului a rămas neschimbat.

Nu am rulat Preview-ul și nu am inspectat vizual fișiere PDF generate pe Android, iOS și Web. Randarea completă folosește MathJax CDN, iar fallback-ul offline este intenționat aproximativ; formulele complexe trebuie verificate pe dispozitive înainte de pilot. Checkout-ul nu este activ și rămâne necesară alegerea platformei, a prețului exact și a integrării de billing.
