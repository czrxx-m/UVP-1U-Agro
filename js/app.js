/* Interacción principal: navegación, instalación, estado de red y refresco del horario. */
(() => {
  const U = window.HU;
  const R = window.AppRender;
  const M = window.HorarioModel;
  const state = { view: "inicio", selectedDay: U.DATE_DAYS[new Date().getDay()], manualDay: false, query: "", filter: "all", installPrompt: null, timer: null };
  const byId = id => document.getElementById(id);
  let toastTimer;

  function updateHeader(now) {
    byId("topbar-date").textContent = U.dateName(now).toLocaleUpperCase("es-MX");
    byId("welcome-date").textContent = U.dateName(now, true).replace(/^./, c => c.toLocaleUpperCase("es-MX")) + " · una cosa a la vez.";
    byId("footer-year").textContent = now.getFullYear();
    byId("semester-label").textContent = (window.MI_HORARIO && window.MI_HORARIO.semestre) || "Horario académico";
  }
  function renderDayPicker() {
    const now = new Date();
    const dateMap = Object.fromEntries(U.DAYS.map(day => [day, M.dayClasses(day)]));
    R.renderDayPicker(state.selectedDay, now, dateMap, day => {
      state.selectedDay = day;
      state.manualDay = day !== U.DATE_DAYS[new Date().getDay()];
      renderDayPicker(); renderWeek();
    });
  }
  function renderWeek() {
    const date = U.dateForDay(state.selectedDay, new Date());
    R.renderWeek(state.selectedDay, date, M.dayClasses(state.selectedDay), new Date());
  }
  function updateNav() {
    document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("is-active", button.dataset.view === state.view));
  }
  function refresh() {
    const now = new Date();
    if (!state.manualDay && state.selectedDay !== U.DATE_DAYS[now.getDay()]) {
      state.selectedDay = U.DATE_DAYS[now.getDay()]; renderDayPicker();
    }
    updateHeader(now);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const todayClasses = M.classesForDate(today);
    const feature = M.getFeatureModel(now);
    R.renderFeature(feature, now);
    R.renderStats(M.calcStats(todayClasses, now, today));
    R.renderTodayAgenda(todayClasses, now, feature.mode === "next-ahead" ? { clase: feature.cls } : null);
    renderWeek();
    R.renderSubjects(M.allSubjects(), state.query, state.filter);
    updateNav();
  }
  function navigate(view, changeHash = true) {
    if (!["inicio", "semana", "materias"].includes(view)) view = "inicio";
    state.view = view;
    document.querySelectorAll(".view").forEach(section => {
      const active = section.id === `view-${view}`;
      section.hidden = !active;
      section.classList.toggle("is-visible", active);
    });
    updateNav();
    if (changeHash && location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
    if (view === "semana") renderWeek();
    if (view === "materias") R.renderSubjects(M.allSubjects(), state.query, state.filter);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function showToast(message) {
    const toast = byId("toast"); toast.textContent = message; toast.classList.add("is-visible");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }
  function setupNavigation() {
    document.addEventListener("click", event => {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) { navigate(viewButton.dataset.view); return; }
      const link = event.target.closest("[data-view-link]");
      if (link) { event.preventDefault(); navigate(link.dataset.viewLink); return; }
      const filter = event.target.closest("[data-filter]");
      if (filter) {
        state.filter = filter.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("is-selected", button === filter));
        R.renderSubjects(M.allSubjects(), state.query, state.filter);
      }
    });
    byId("go-today").addEventListener("click", () => {
      state.selectedDay = U.DATE_DAYS[new Date().getDay()]; state.manualDay = false;
      renderDayPicker(); renderWeek(); showToast("Ya estás viendo el día de hoy.");
    });
    byId("subject-search-input").addEventListener("input", event => {
      state.query = event.target.value; R.renderSubjects(M.allSubjects(), state.query, state.filter);
    });
    window.addEventListener("hashchange", () => navigate(location.hash.slice(1) || "inicio", false));
  }
  function setupInstall() {
    const button = byId("install-button");
    window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); state.installPrompt = event; button.hidden = false; });
    button.addEventListener("click", async () => {
      if (!state.installPrompt) { showToast("En el menú del navegador, elige “Instalar app” o “Añadir a pantalla de inicio”."); return; }
      state.installPrompt.prompt();
      try { await state.installPrompt.userChoice; } catch (_) { /* La persona pudo cerrar el aviso. */ }
      state.installPrompt = null; button.hidden = true;
    });
    window.addEventListener("appinstalled", () => { button.hidden = true; showToast("Mi Horario quedó instalado en tu dispositivo."); });
  }
  function setupConnection() {
    const status = document.querySelector(".offline-status"), label = byId("connection-label");
    const render = () => { const offline = !navigator.onLine; status.classList.toggle("is-offline", offline); label.textContent = offline ? "Modo sin conexión" : "Lista para tu día"; };
    window.addEventListener("online", render); window.addEventListener("offline", render); render();
  }
  function setupServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => console.warn("No se pudo registrar el modo sin conexión:", error)));
  }
  function setupSplash() {
    const splash = byId("splash");
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 140 : 720;
    window.setTimeout(() => splash.classList.add("is-hidden"), delay);
    window.setTimeout(() => splash.remove(), delay + 500);
  }
  function start() {
    document.querySelectorAll("[data-icon]").forEach(node => node.replaceChildren(U.icon(node.dataset.icon)));
    state.selectedDay = U.DATE_DAYS[new Date().getDay()];
    setupNavigation(); setupInstall(); setupConnection(); setupServiceWorker(); setupSplash();
    renderDayPicker();
    navigate((location.hash || "#inicio").replace(/^#/, ""), false);
    refresh();
    const alignAndRefresh = () => {
      clearTimeout(state.timer);
      const now = new Date();
      const wait = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 80;
      state.timer = setTimeout(() => { refresh(); alignAndRefresh(); }, wait);
    };
    alignAndRefresh();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    window.addEventListener("pageshow", () => refresh());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
