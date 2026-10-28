
## Structura fișierelor

Varianta web nu folosește React:

- `index.html` — markup-ul paginii și fallback-ul vizual inline.
- `styles.css` — designul Glassmorphism, temele și responsive layout-ul.
- `app.js` — tutor demo, tema, căutarea, testul și interacțiunile.

Fișierele React Native/Expo `.tsx` din proiectul părinte sunt o aplicație mobilă separată. Browserul nu poate executa direct `.tsx`; pentru website trebuie folosite fișierele de mai sus.
