const subjects = [
  { name: "Matematică", description: "Ecuații, funcții și raționament.", icon: "sigma" },
  { name: "Fizică", description: "Formule, unități și fenomene.", icon: "atom" },
  { name: "Chimie", description: "Reacții și legături explicate.", icon: "flask-conical" },
  { name: "Biologie", description: "Procese, sisteme și concepte.", icon: "leaf" },
  { name: "Română", description: "Texte, idei și argumentare.", icon: "book-open" },
];
const demoResponses = {
  hint: "Privește operația care este cel mai departe de necunoscută. Aplică operația inversă pe ambele părți. Ce obții după acest singur pas?",
  concept: "O ecuație rămâne echilibrată dacă faci aceeași operație pe ambele părți. În LaTeX: \\(a+b=c \\Rightarrow a=c-b\\). Ce operație inversă observi în problema ta?",
  practice: "Încearcă exercițiul \\(2x+5=17\\). Nu căuta rezultatul complet. Ce ai elimina mai întâi și de ce?",
  default: "Am înțeles. Înainte să continui, spune-mi ce date sunt cunoscute și ce trebuie aflat. Care este primul lucru pe care îl observi?",
};
const state = { subject: "Toate", query: "", progress: 0, authMode: "signin" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("visible"); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3500); }
function saveState() { localStorage.setItem("elunariq.website.v2", JSON.stringify({ theme: document.body.classList.contains("light") ? "light" : "dark", progress: state.progress })); }
function loadState() { try { const saved = JSON.parse(localStorage.getItem("elunariq.website.v2") || "{}"); if (saved.theme === "light") document.body.classList.add("light"); if (typeof saved.progress === "number") state.progress = saved.progress; } catch { /* demo state is optional */ } }
function renderSubjects() {
  const normalized = state.query.trim().toLocaleLowerCase("ro");
  const visible = subjects.filter((subject) => !normalized || `${subject.name} ${subject.description}`.toLocaleLowerCase("ro").includes(normalized));
  $("#subject-list").innerHTML = visible.length ? visible.map((subject) => `<button class="subject-card glass-panel" data-subject="${subject.name}" aria-label="Alege materia ${subject.name}"><span class="subject-icon"><i data-lucide="${subject.icon}"></i></span><span><h3>${subject.name}</h3><p>${subject.description}</p></span><span class="glass-chip">Alege</span></button>`).join("") : `<div class="glass-panel" style="padding:20px;grid-column:1/-1"><strong>Nu am găsit încă acest topic.</strong><p class="muted">Încearcă numele unei materii sau al unei lecții.</p></div>`;
  $$("[data-subject]").forEach((button) => button.addEventListener("click", () => { const name = button.dataset.subject; $("#tutor-subject").value = name; document.querySelector("#tutor").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); showToast(`${name} este selectată.`); }));
  refreshIcons();
}
function renderProgress() {
  $("#progress-value").textContent = state.progress;
  $("#progress-fill").style.width = `${state.progress}%`;
  $("#progress-subjects").innerHTML = subjects.slice(0, 4).map((subject) => `<article class="mini-progress glass-panel"><header><span>${subject.name}</span><span>Disponibilă</span></header><p>${subject.description}</p><div class="mini-track"><span style="width:0%"></span></div></article>`).join("");
}
function addMessage(role, text) { const message = document.createElement("div"); message.className = `chat-message ${role}`; if (role === "assistant") { message.innerHTML = `<span class="message-label">Elunariq</span><p></p>`; message.querySelector("p").textContent = text; } else { message.innerHTML = `<p>${escapeHtml(text)}</p>`; } $("#chat-log").appendChild(message); message.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" }); return message; }
function replyFor(text) { const normalized = text.toLocaleLowerCase("ro"); if (normalized.includes("indiciu") || normalized.includes("hint")) return demoResponses.hint; if (normalized.includes("idee") || normalized.includes("concept")) return demoResponses.concept; if (normalized.includes("exerci") || normalized.includes("practic")) return demoResponses.practice; return demoResponses.default; }
function revealReply(node, text) { const target = node.querySelector("p"); if (reduceMotion) { target.textContent = text; return; } const words = text.split(" "); let index = 0; const timer = window.setInterval(() => { target.textContent += `${index ? " " : ""}${words[index]}`; index += 1; if (index >= words.length) window.clearInterval(timer); }, 34); }
function submitTutor(text) { const value = text.trim(); if (!value) return; addMessage("user", value); $("#chat-input").value = ""; const pending = addMessage("assistant", "Scriu următorul pas…"); pending.classList.add("pending"); window.setTimeout(() => { pending.classList.remove("pending"); revealReply(pending, replyFor(value)); }, reduceMotion ? 0 : 520); }
function toggleTheme() { document.body.classList.toggle("light"); const icon = $("[data-action=theme] i"); if (icon) icon.setAttribute("data-lucide", document.body.classList.contains("light") ? "moon" : "sun"); refreshIcons(); saveState(); showToast(document.body.classList.contains("light") ? "Tema luminoasă este activă." : "Tema întunecată este activă."); }
function openAuth(mode = "signin") { state.authMode = mode; $("#auth").hidden = false; $("#auth-title").textContent = mode === "signup" ? "Creează contul Elunariq." : "Intră în Elunariq."; $("#auth-submit").textContent = mode === "signup" ? "Creează contul" : "Intră în cont"; $("#auth-note").textContent = "Demo local: nu trimitem parola nicăieri."; $("#auth").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); }
function startTest() { $("#test-feedback").textContent = ""; $("#test-dialog").showModal(); refreshIcons(); }
function bind() {
  $("[data-action=theme]").addEventListener("click", toggleTheme);
  $$('[data-action="focus-tutor"]').forEach((button) => button.addEventListener("click", () => $("#tutor").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" })));
  $$('[data-action="open-auth"]').forEach((button) => button.addEventListener("click", () => openAuth(button.dataset.authMode)));
  $("[data-action=close-auth]").addEventListener("click", () => { $("#auth").hidden = true; });
  $("[data-action=toggle-auth]").addEventListener("click", () => openAuth(state.authMode === "signin" ? "signup" : "signin"));
  $("[data-action=start-test]").addEventListener("click", startTest);
  $("[data-action=close-test]").addEventListener("click", () => $("#test-dialog").close());
  $$("[data-test-answer]").forEach((button) => button.addEventListener("click", () => { const correct = button.dataset.testAnswer === "right"; $("#test-feedback").textContent = correct ? "Corect. Ai ales operația care păstrează egalitatea." : "Nu încă. Gândește-te la operația inversă și încearcă din nou."; if (correct) { state.progress = Math.min(100, Math.max(10, state.progress + 10)); renderProgress(); saveState(); } }));
  $("#search-input").addEventListener("input", (event) => { state.query = event.target.value; renderSubjects(); });
  $("#chat-form").addEventListener("submit", (event) => { event.preventDefault(); submitTutor($("#chat-input").value); });
  $$("[data-prompt]").forEach((button) => button.addEventListener("click", () => submitTutor(button.dataset.prompt)));
  $("#auth-form").addEventListener("submit", (event) => { event.preventDefault(); $("#auth-note").textContent = state.authMode === "signup" ? "Cont demo creat. Datele rămân doar în această sesiune." : "Ai intrat în contul demo local."; showToast("Acțiune demo finalizată."); });
  $("#contact-form").addEventListener("submit", (event) => { event.preventDefault(); event.target.reset(); showToast("Mesajul demo a fost pregătit."); });
  if (!reduceMotion) $$(".glass-panel").forEach((panel) => panel.addEventListener("pointermove", (event) => { const rect = panel.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - .5; const y = (event.clientY - rect.top) / rect.height - .5; panel.style.transform = `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg)`; }));
  if (!reduceMotion) $$(".glass-panel").forEach((panel) => panel.addEventListener("pointerleave", () => { panel.style.transform = ""; }));
}
loadState();
renderSubjects();
renderProgress();
bind();
refreshIcons();
