# Elunariq: stare funcțională pentru pilot

Acest document separă funcțiile pe care echipa le poate demonstra acum de cele care necesită servicii reale. Interfața nu trebuie să prezinte funcții din a doua categorie ca fiind active.

## Funcționează în buildul curent

- Dashboard și navigare pe patru ecrane; selectoare de materii și căutare.
- Chatul poate folosi serviciul AI configurat pe server; la indisponibilitate folosește conținut demo etichetat.
- Activitatea întrebărilor și preferințele se păstrează local; sesiunile tutorului generează titlurile lecțiilor afișate. După autentificarea elevului, progresul este sincronizat pe server.
- Exportul conversației/recapitulării ca PDF este implementat. Pe Web se deschide printarea browserului; pe mobil se folosește print și share Expo.
- Imaginile/PDF-urile sunt trimise la modelul multimodal configurat, iar TXT este inclus în mesaj; analiza cere un model cu suport pentru acel format. Vocea este transcrisă de endpointul configurat și apare în casetă pentru verificare.
- Diagramele sunt interpretate ca JSON structurat validat, apoi randate determinist în SVG: geometria folosește puncte și relații, iar chimia folosește grafuri moleculare cu valență verificată. Sunt afișate în chat și exportate în PDF; structurile ambigue sunt omise.
- Înregistrare și autentificare cu e-mail/parolă, sesiune pe 30 de zile, cod de asociere părinte-elev cu expirare și vedere de progres a părintelui sunt implementate pe server. Din Progres, elevul poate crea codul, iar părintele se poate înregistra și asocia direct.
- Cererile centrelor sunt stocate în aplicație și pot fi aprobate/respinse de un administrator. Centrele aprobate au spațiu privat pentru materiale și elevi; înscrierea elevilor folosește un cod temporar, iar descărcările verifică apartenența la centru.
- Pentru ca juriul să vadă cererile, contul său trebuie să aibă rolul `admin`. Creează mai întâi contul evaluatorului, apoi acordă rolul din baza de date, de exemplu: `UPDATE users u JOIN auth_accounts a ON a.userId = u.id SET u.role = 'admin' WHERE a.email = 'jury@example.ro';`. Nu adăuga această promovare în fluxul public de înregistrare.
- Chatul AI nu impune momentan Premium sau o cotă per cont. Limitele de intrare și tokeni rămân active, iar disponibilitatea depinde de creditele și rate limit-urile OpenRouter; generarea de imagini folosește separat Forge și configurația sa de server. Pentru jurizare, păstrați limitele tehnice și ajustați bugetul/creditul furnizorului, nu dezactivați limitele global.
- Tema luminoasă/întunecată și tokenurile de culoare există; nu există încă editor de paletă sau audit automat de contrast pentru toate stările.

## Nu este încă funcțional pentru elevi reali

| Cerință | Stare | Ce trebuie conectat |
|---|---|---|
| Cont elev | Autentificarea și sincronizarea sunt implementate; așteaptă migrarea DB și testarea pe Render. Tokenul client este încă în AsyncStorage. | Migrare DB, SecureStore pe mobil, verificare e-mail și recuperare parolă. |
| Cont părinte și monitorizare | Asociere cu cod temporar, folosit o singură dată; părintele se poate înregistra din Progres și vede întrebările și lecțiile elevului asociat. Necesită migrarea DB. | Migrare DB și verificarea consimțământului/fluxului pentru minori înainte de pilot. |
| Spațiu pentru centru | Cerere cu aprobare administrativă, încărcare de materiale, cod pentru elevi și acces privat la fișiere. Necesită migrarea DB, cont cu rol admin și Forge Storage configurat. | Aplicați migrațiile `0004_education_spaces.sql` și `0005_center_join_requests.sql`, creați contul evaluatorului și acordați-i rolul `admin` în baza de date, verificați upload/download și procesați cererile cu un administrator. |
| Abonament | Profilul prezintă doar o ofertă propusă. Checkout-ul nu este activ. | Preț și termeni finali, billing pentru platformele selectate, verificare server-side, restaurare și anulare. |
| Analiză temă din poză/PDF | Atașamentele sunt trimise către modelul configurat; imagini folosesc vision, PDF folosește file input. TXT este decodat în server. | Verificare pe model/backend-ul de producție și controale suplimentare pentru fișiere malițioase. |
| Intrare vocală | Înregistrarea se trimite la transcriere și textul se poate edita înainte de trimitere. | Configurarea Forge STT pe server și verificarea formatelor iOS/Android/Web. |
| Desene la matematică/fizică/chimie | Interpretare structurată, validare și randere SVG deterministă pentru forme geometrice și grafuri moleculare uzuale; inclusă în PDF. | Layouturile fără măsurători sunt schematice; validarea pe dispozitive și pentru enunțuri reale rămâne necesară. |
| Lecții din programa elevului | Activitatea reală este listată local, dar biblioteca de capitole/lecții și adaptarea la clasa/programă nu sunt conectate. | Profil școlar clar, catalog verificat pe programă, mapare tutor și progres la obiective reale. |
| Formule LaTeX | Chatul aplică un formatter aproximativ de simboluri uzuale. PDF-ul încearcă MathJax online și are fallback. | Motor de randare comun și verificare offline/mobile a formulelor complexe. |

## Recomandarea de lansare

Înainte de pilot, aplicați migrațiile până la `0005_center_join_requests.sql`, configurați baza de date, Forge Storage, modelele vision și Forge STT pe server și validați toate fluxurile pe aplicațiile/platformele țintă. Premium rămâne informativ până când sunt alese platforma de publicare, prețul final și integrarea de plată; în buildul curent nicio plată nu este colectată.

## Ordine tehnică sugerată

1. Rulați migrarea DB și autentificarea/asocierea în mediul Render, apoi validați conturile și sincronizarea cu elevi de test.
2. Verificați vision/PDF și transcrierea cu modelele și credentialele efectiv configurate.
3. Integrați SecureStore, verificare e-mail și recuperare parolă înainte de lansarea mobilă.
4. Verificați diagramele și formulele/PDF-urile pe Android, iOS și Web cu enunțuri reale și modelele de producție.
5. Alegeți platforma și prețul Premium, apoi integrați magazinul de plăți și verificarea drepturilor pe server.
6. Publicați fluxul de consimțământ, retenție și ștergere a datelor pentru elevi minori.
