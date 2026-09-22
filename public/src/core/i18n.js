// Language and theme: t(), applyLanguage(), theme switching.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { STORAGE_LANG_KEY, STORAGE_THEME_KEY, warnStorage } from "../constants.js";
import { TRANSLATIONS } from "../data/i18n.js";

export const i18nMethods = {
  loadLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_LANG_KEY);
      if (stored === "en" || stored === "ro") return stored;
    } catch (e) { warnStorage(e); }
    // Default to Romanian ('ro')
    return "ro";
  },
  saveLanguage(lang) {
    this.currentLang = lang;
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch (e) { warnStorage(e); }
  },
  loadTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch (e) { warnStorage(e); }
    return "light";
  },
  applyTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = this.theme;
    document.documentElement.style.colorScheme = this.theme;
    const nextTheme = this.theme === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const label = this.t(nextTheme === "light" ? "theme_switch_to_light" : "theme_switch_to_dark");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.setAttribute("aria-pressed", String(this.theme === "light"));
    });
    try { localStorage.setItem(STORAGE_THEME_KEY, this.theme); } catch (e) { warnStorage(e); }
  },
  toggleTheme() {
    this.applyTheme(this.theme === "dark" ? "light" : "dark");
  },
  t(key, fallback = "") {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS.ro;
    if (dict[key] !== undefined) return dict[key];
    if (!this._missingKeys) this._missingKeys = new Set();
    if (!this._missingKeys.has(key)) {
      this._missingKeys.add(key);
      console.warn(`[i18n] missing key "${key}" (${this.currentLang})`);
    }
    return fallback || key;
  },
  // t() with {placeholders}: tf("key", { count: 3 })
  tf(key, vars = {}) {
    return this.t(key).replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  },
  // Pluralised tf(): uses "<key>_one" when n === 1 and that key exists.
  tn(key, n, vars = {}) {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS.ro;
    const k = n === 1 && dict[`${key}_one`] !== undefined ? `${key}_one` : key;
    return this.tf(k, { count: n, ...vars });
  },
  // BCP 47 locale for dates/numbers in the current UI language.
  locale() {
    return this.currentLang === "en" ? "en-GB" : "ro-RO";
  },
  setLanguage(lang) {
    if (lang !== "ro" && lang !== "en") lang = "ro";
    this.saveLanguage(lang);
    this.applyLanguage(lang, true);
  },
  applyLanguage(lang, reRenderViews = true) {
    // Static labels declare their key in the markup: data-i18n (text) and
    // data-i18n-placeholder / data-i18n-title / data-i18n-aria-label (attributes).
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });
    for (const attr of ["placeholder", "title", "aria-label"]) {
      document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
        el.setAttribute(attr, this.t(el.getAttribute(`data-i18n-${attr}`)));
      });
    }

    // Update all language toggle buttons
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.lang === lang);
    });

    // Role-dependent and state-dependent labels
    this.applyTheme(this.theme); // theme toggle titles
    if (this.dom.navAdminQuotaBadge) this.dom.navAdminQuotaBadge.title = this.t("nav_quota_alert_tooltip");
    this.applyRoleNavigation();

    const filterRoomBtn = document.getElementById("filter-my-events-room");
    if (filterRoomBtn) {
      filterRoomBtn.style.display = this.canBookRooms() ? "inline-flex" : "none";
    }
    if (this.activeApp === "events" && this.eventsLayoutMode === "my-events") {
      this.renderMyEventsPage();
    }
    const evDialogTitleLabel = document.querySelector("label[for='event-title-input']");
    if (evDialogTitleLabel) evDialogTitleLabel.textContent = this.t("event_form_title_label");
    const evDialogMatrixHint = document.querySelector("#event-free-hours-board")?.previousElementSibling?.querySelector("span");
    if (evDialogMatrixHint) evDialogMatrixHint.textContent = this.t("event_matrix_hint");
    document.querySelectorAll("input[name='event-timing-mode']").forEach(input => {
      const label = input.closest("label");
      if (label) label.lastChild.textContent = ` ${this.t(input.value === "async" ? "event_timing_async" : "event_timing_consecutive")}`;
    });
    const evDialogDescLabel = document.querySelector("label[for='event-desc-input']");
    if (evDialogDescLabel) evDialogDescLabel.textContent = this.t("event_form_desc_label");
    if (this.dom.saveEventBtn) this.dom.saveEventBtn.textContent = this.t("event_save_btn");
    if (this.wizardStepsConfig) {
      this.renderWizardIndicator();
      if (this.dom.wizardPrevBtn) {
        this.dom.wizardPrevBtn.textContent = this.wizardCurrentStep === 1 ? (this.t("cancel")) : (this.t("wizard_btn_back"));
      }
      if (this.dom.wizardNextBtn) {
        this.dom.wizardNextBtn.textContent = this.t("wizard_btn_next");
      }
    }

    // Event Detail Dialog
    if (this.dom.eventDetailRecurrentBadge) this.dom.eventDetailRecurrentBadge.textContent = this.t("event_detail_recurrent");

    // Post Dialog
    const postSpecTitle = document.getElementById("spec-summary-title");
    if (postSpecTitle) postSpecTitle.textContent = this.t("post_spec_title");
    if (this.dom.btnTestShareLink) this.dom.btnTestShareLink.textContent = this.t("post_test_share_btn");

    // Post Detail Dialog
    if (this.dom.btnDetailOpenShare) this.dom.btnDetailOpenShare.textContent = this.t("post_detail_open_share_btn");

    // Control Panel Dialog
    const cpTitle = document.getElementById("cp-dialog-title");
    if (cpTitle) cpTitle.innerHTML = `<span>${this.t("cp_title")}</span>`;

    // Standards Matrix Dialog
    const standardsTitle = document.getElementById("standards-dialog-title");
    if (standardsTitle) standardsTitle.innerHTML = `<span>${this.t("standards_title")}</span>`;

    // Re-render sub-app views if requested
    if (reRenderViews) {
      if (this.activeApp === "social") {
        this.render();
      } else if (this.activeApp === "events") {
        this.renderEventsCalendar();
      } else if (this.activeApp === "admin") {
        this.renderAdminPanel();
      }
    }

    // Document title & lang attribute
    document.title = this.t("doc_title");
    document.documentElement.lang = lang;

    // Weekend watermark CSS variable
    document.documentElement.style.setProperty('--weekend-label', '"' + this.t("weekend_label") + '"');
  }
};
