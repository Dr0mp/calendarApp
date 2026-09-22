import { DEFAULT_PLATFORMS, INITIAL_POSTS, INITIAL_EVENTS, DEFAULT_SPACES, DEFAULT_ROOMS } from "./seed-data.js";
import { TRANSLATIONS, MONTH_NAMES, SHORT_MONTH_NAMES, WEEKDAY_NAMES } from "./i18n.js";

// Storage Keys
const STORAGE_PLATFORMS_KEY = "social_cal_platforms_2026_v1";
const STORAGE_POSTS_KEY = "social_cal_posts_2026_v1";
const STORAGE_PREFS_KEY = "social_cal_prefs_2026_v1";
const STORAGE_LANG_KEY = "cal_suite_lang_v1";
const STORAGE_THEME_KEY = "cal_suite_theme_v1";

const STORAGE_EVENTS_KEY = "cal_suite_events_v1";
const STORAGE_SPACES_KEY = "cal_suite_spaces_v2";
const STORAGE_ROOMS_KEY = "cal_suite_rooms_v2";
const STORAGE_ACTIVE_APP_KEY = "cal_suite_active_app_v1";
const STORAGE_STORAGE_SIM_KEY = "cal_suite_storage_sim_v1";
// Storage/parse failures used to be swallowed silently; keep them visible in the console.
function warnStorage(error) {
  console.warn("[storage]", error);
}

const DEFAULT_STORAGE_QUOTA_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

class SocialCalendarApp {
  constructor() {
    this.cleanupLegacyStorage();

    // Platform & Social Posts Data
    this.platforms = this.loadPlatforms();
    this.posts = this.loadPosts();

    // Users, Spaces, Accommodation Rooms & Team Events Data
    this.users = []; // filled from the server by fetchServerUsers()
    this.spaces = this.loadSpaces();
    this.rooms = this.loadRooms();
    this.events = this.loadEvents();
    // The server session (httpOnly cookie) is the only source of truth: initServerAuth() decides the view.
    this.currentUser = null;
    this.eventEntryType = "event"; // 'event' | 'locked'
    this.adminActiveCategory = "users"; // 'users' | 'events' | 'spaces' | 'rooms' | 'storage' | 'all'

    // Storage Quota State (8 GB Cap)
    this.storageQuotaBytes = DEFAULT_STORAGE_QUOTA_BYTES;
    // Developer-only quota simulator: open the app with ?dev=1 to show it.
    this.devMode = new URLSearchParams(location.search).has("dev");
    this.simulatedStorageRatio = this.devMode ? this.loadSimulatedStorage() : null;
    
    this.activeApp = "login";
    this.pendingLoginTarget = null;

    // Social Calendar view state (defaults: Year, Toate Platformele)
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.selectedPlatformId = "all";
    this.viewMode = "year"; // 'year' | 'calendar' | 'feed'
    this.currentDetailPostId = null;
    this.currentPostMedia = null;
    this.socialSearchQuery = "";

    // Team Events Calendar view state (defaults: Year zoom, Toate users)
    this.eventsCurrentYear = today.getFullYear();
    this.eventsCurrentMonth = today.getMonth();
    this.eventsActiveDate = this.getTodayDateString();
    this.eventsSelectedUser = "all";
    this.eventsZoomLevel = "yearly"; // 'daily' | 'monthly' | 'yearly'
    this.eventsOffHoursExpanded = false;
    this.eventsLayoutMode = "panel"; // 'panel' | 'schedule' | 'my-events'
    this.currentDetailEventId = null;
    this.isFbImageValid = false;
    this.eventFormMode = "schedule";
    this.eventTimingMode = "consecutive";
    this.eventAsyncHours = [];
    this.eventPendingPromotionId = null;
    this.notifFilter = "pending";

    // Language state: defaults to 'ro' (Romanian)
    this.currentLang = this.loadLanguage();
    this.theme = this.loadTheme();

    this.initElements();
    this.dom.storageSimToolbar?.toggleAttribute("hidden", !this.devMode);
    this.applyTheme(this.theme);
    this.loadPrefs();
    this.bindEvents();
    this.applyLanguage(this.currentLang, false);

    // Hide the UI until the server session check resolves (avoids flashing the login screen).
    document.documentElement.classList.add("is-booting");
    this.setAppView(this.activeApp);

    // Initialize server-side auth handshake
    this.initServerAuth();
  }

  isDemoAccount() {
    return Boolean(this.currentUser && (this.currentUser.isDemo || this.currentUser.username === "demo" || this.currentUser.username === "demo_admin"));
  }

  canBookRooms() {
    if (!this.currentUser) return false;
    return this.currentUser.role === "admin" || this.currentUser.role === "moderator";
  }

  // Storage Handlers
  loadPlatforms() {
    try {
      const stored = localStorage.getItem(STORAGE_PLATFORMS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map(p => {
          const def = DEFAULT_PLATFORMS.find(d => d.id === p.id);
          if (def) {
            if (!p.iconUrl) p.iconUrl = def.iconUrl;
            if (!p.domain) p.domain = def.domain;
          }
          if (p.enabled === undefined) p.enabled = true;
          return p;
        });
      }
    } catch (e) {
      console.warn("Error loading platforms from localStorage", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_PLATFORMS));
  }

  savePlatforms() {
    try {
      localStorage.setItem(STORAGE_PLATFORMS_KEY, JSON.stringify(this.platforms));
    } catch (e) {
      console.error("Error saving platforms", e);
    }
  }

  loadPosts() {
    try {
      const stored = localStorage.getItem(STORAGE_POSTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Error loading posts from localStorage", e);
    }
    return JSON.parse(JSON.stringify(INITIAL_POSTS));
  }

  savePosts() {
    try {
      localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(this.posts));
    } catch (e) {
      console.error("Error saving posts", e);
    }
  }

  // Spaces & Venues Storage
  loadSpaces() {
    try {
      const stored = localStorage.getItem(STORAGE_SPACES_KEY);
      if (stored) {
        let spaces = JSON.parse(stored);
        const validIds = DEFAULT_SPACES.map(s => s.id);
        spaces = spaces.filter(s => validIds.includes(s.id));
        if (spaces.length === 0) spaces = JSON.parse(JSON.stringify(DEFAULT_SPACES));
        localStorage.setItem(STORAGE_SPACES_KEY, JSON.stringify(spaces));
        return spaces;
      }
    } catch (e) { warnStorage(e); }
    return JSON.parse(JSON.stringify(DEFAULT_SPACES || []));
  }

  saveSpaces() {
    try {
      localStorage.setItem(STORAGE_SPACES_KEY, JSON.stringify(this.spaces));
    } catch (e) { warnStorage(e); }
  }

  // Accommodation / Sleeping Rooms Storage
  loadRooms() {
    try {
      const stored = localStorage.getItem(STORAGE_ROOMS_KEY);
      if (stored) {
        let rooms = JSON.parse(stored);
        const validIds = DEFAULT_ROOMS.map(r => r.id);
        rooms = rooms.filter(r => validIds.includes(r.id));
        if (rooms.length === 0) rooms = JSON.parse(JSON.stringify(DEFAULT_ROOMS));
        localStorage.setItem(STORAGE_ROOMS_KEY, JSON.stringify(rooms));
        return rooms;
      }
    } catch (e) { warnStorage(e); }
    return JSON.parse(JSON.stringify(DEFAULT_ROOMS || []));
  }

  saveRooms() {
    try {
      localStorage.setItem(STORAGE_ROOMS_KEY, JSON.stringify(this.rooms));
    } catch (e) { warnStorage(e); }
  }

  // Events Storage
  loadEvents() {
    try {
      const stored = localStorage.getItem(STORAGE_EVENTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) { warnStorage(e); }
    return JSON.parse(JSON.stringify(INITIAL_EVENTS));
  }

  saveEvents() {
    try {
      localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(this.events));
    } catch (e) { warnStorage(e); }
    this.updateStorageQuotaDisplay();
    this.updateMyEventsBadgeCount();
    if (this.activeApp === "events" && this.eventsLayoutMode === "my-events") {
      this.renderMyEventsPage();
    }
  }

  // Vibrant, Lively Color Theming for User Events (Low-Bleed Dark Mode Tint)
  getEventTheme(event) {
    if (!event) {
      return {
        accent: "#f43f5e",
        gradient: "linear-gradient(135deg, rgba(244, 63, 94, 0.18) 0%, rgba(251, 113, 133, 0.05) 100%)",
        border: "rgba(244, 63, 94, 0.45)",
        glow: "rgba(244, 63, 94, 0.20)",
        tagBg: "rgba(244, 63, 94, 0.20)",
        tagColor: "#fecdd3",
        isUserEvent: true
      };
    }

    const username = (event.creatorUsername || "").toLowerCase();
    const creatorId = (event.creatorId || "").toLowerCase();

    // User: Anca Ciliac -> Radiant Rose Coral
    if (username === "anca" || creatorId === "user-anca") {
      return {
        accent: "#f43f5e",
        gradient: "linear-gradient(135deg, rgba(244, 63, 94, 0.18) 0%, rgba(251, 113, 133, 0.05) 100%)",
        border: "rgba(244, 63, 94, 0.45)",
        glow: "rgba(244, 63, 94, 0.20)",
        tagBg: "rgba(244, 63, 94, 0.20)",
        tagColor: "#fecdd3",
        isUserEvent: true
      };
    }

    // User: Alex W -> Electric Sky Cyan
    if (username === "alex" || creatorId === "user-alex") {
      return {
        accent: "#0ea5e9",
        gradient: "linear-gradient(135deg, rgba(14, 165, 233, 0.18) 0%, rgba(56, 189, 248, 0.05) 100%)",
        border: "rgba(14, 165, 233, 0.45)",
        glow: "rgba(14, 165, 233, 0.20)",
        tagBg: "rgba(14, 165, 233, 0.20)",
        tagColor: "#bae6fd",
        isUserEvent: true
      };
    }

    // User: Creative Team -> Vivid Mint Emerald
    if (username === "team" || creatorId === "user-team") {
      return {
        accent: "#10b981",
        gradient: "linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(52, 211, 153, 0.05) 100%)",
        border: "rgba(16, 185, 129, 0.45)",
        glow: "rgba(16, 185, 129, 0.20)",
        tagBg: "rgba(16, 185, 129, 0.20)",
        tagColor: "#a7f3d0",
        isUserEvent: true
      };
    }

    // Admin -> Sunburst Amber
    if (username === "admin" || creatorId === "user-admin") {
      return {
        accent: "#f59e0b",
        gradient: "linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(251, 191, 36, 0.05) 100%)",
        border: "rgba(245, 158, 11, 0.45)",
        glow: "rgba(245, 158, 11, 0.20)",
        tagBg: "rgba(245, 158, 11, 0.20)",
        tagColor: "#fde68a",
        isUserEvent: false
      };
    }

    // Dynamic bright theme for any other user
    const baseColor = event.color || "#ec4899";
    return {
      accent: baseColor,
      gradient: `linear-gradient(135deg, ${this.hexToRgba(baseColor, 0.18)} 0%, ${this.hexToRgba(baseColor, 0.05)} 100%)`,
      border: this.hexToRgba(baseColor, 0.45),
      glow: this.hexToRgba(baseColor, 0.20),
      tagBg: this.hexToRgba(baseColor, 0.20),
      tagColor: "#ffffff",
      isUserEvent: true
    };
  }

  getEventSurface(theme) {
    if (this.theme !== "light") return theme.gradient;
    return `linear-gradient(135deg, ${this.hexToRgba(theme.accent, 0.14)} 0%, ${this.hexToRgba(theme.accent, 0.045)} 100%)`;
  }

  hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return `rgba(244, 63, 94, ${alpha})`;
    const cleanHex = hex.replace("#", "");
    const fullHex = cleanHex.length === 3 
      ? cleanHex.split("").map(c => c + c).join("")
      : cleanHex.padEnd(6, "0");
    const r = parseInt(fullHex.substring(0, 2), 16) || 0;
    const g = parseInt(fullHex.substring(2, 4), 16) || 0;
    const b = parseInt(fullHex.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  loadSimulatedStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_STORAGE_SIM_KEY);
      return stored !== null ? parseFloat(stored) : null;
    } catch (e) {
      return null;
    }
  }

  saveSimulatedStorage(ratio) {
    try {
      if (ratio === null) {
        localStorage.removeItem(STORAGE_STORAGE_SIM_KEY);
      } else {
        localStorage.setItem(STORAGE_STORAGE_SIM_KEY, String(ratio));
      }
    } catch (e) { warnStorage(e); }
    this.simulatedStorageRatio = ratio;
  }

  // Current User Session
  // One-time removal of localStorage keys written by earlier builds.
  cleanupLegacyStorage() {
    const SCHEMA_KEY = "cal_suite_schema";
    const SCHEMA_VERSION = 3;
    try {
      if (Number(localStorage.getItem(SCHEMA_KEY)) >= SCHEMA_VERSION) return;
      ["cal_suite_auth_session_v1", "cal_suite_users_v1", "cal_suite_spaces_v1", "cal_suite_rooms_v1"].forEach(k => localStorage.removeItem(k));
      localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
    } catch (e) {
      console.warn("Legacy storage cleanup skipped:", e);
    }
  }

  loadPrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem(STORAGE_PREFS_KEY) || "{}");
      if (prefs.selectedPlatformId && (prefs.selectedPlatformId === "all" || this.getPlatform(prefs.selectedPlatformId))) {
        const p = this.getPlatform(prefs.selectedPlatformId);
        if (p && p.enabled === false) {
          this.selectedPlatformId = "all";
        } else {
          this.selectedPlatformId = prefs.selectedPlatformId;
        }
      } else {
        this.selectedPlatformId = "all";
      }
      if (prefs.viewMode && ["year", "calendar", "feed"].includes(prefs.viewMode)) {
        this.viewMode = prefs.viewMode;
      } else {
        this.viewMode = "year"; // Default Social: Year
      }
      if (prefs.eventsZoomLevel && ["daily", "monthly", "yearly"].includes(prefs.eventsZoomLevel)) {
        this.eventsZoomLevel = prefs.eventsZoomLevel;
      } else {
        this.eventsZoomLevel = "yearly"; // Default Calendar: Year
      }
      if (prefs.eventsSelectedUser !== undefined) {
        this.eventsSelectedUser = prefs.eventsSelectedUser;
      } else {
        this.eventsSelectedUser = "all"; // Default User Filter: Toate
      }
      if (prefs.eventsLayoutMode && ["panel", "schedule", "my-events"].includes(prefs.eventsLayoutMode)) {
        this.eventsLayoutMode = prefs.eventsLayoutMode;
      } else {
        this.eventsLayoutMode = "panel";
      }
      if (prefs.adminActiveCategory && ["users", "events", "spaces", "rooms", "storage", "all"].includes(prefs.adminActiveCategory)) {
        this.adminActiveCategory = prefs.adminActiveCategory;
      } else {
        this.adminActiveCategory = "users"; // Default Admin: Conturi utilizatori
      }
    } catch (e) {
      this.selectedPlatformId = "all";
      this.viewMode = "year";
      this.eventsZoomLevel = "yearly";
      this.eventsSelectedUser = "all";
      this.eventsLayoutMode = "panel";
      this.adminActiveCategory = "users";
    }
  }

  savePrefs() {
    try {
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify({
        selectedPlatformId: this.selectedPlatformId,
        viewMode: this.viewMode,
        eventsZoomLevel: this.eventsZoomLevel,
        eventsSelectedUser: this.eventsSelectedUser,
        eventsLayoutMode: this.eventsLayoutMode,
        adminActiveCategory: this.adminActiveCategory
      }));
    } catch (e) { warnStorage(e); }
  }

  loadLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_LANG_KEY);
      if (stored === "en" || stored === "ro") return stored;
    } catch (e) { warnStorage(e); }
    // Default to Romanian ('ro')
    return "ro";
  }

  saveLanguage(lang) {
    this.currentLang = lang;
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch (e) { warnStorage(e); }
  }

  loadTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch (e) { warnStorage(e); }
    return "light";
  }

  applyTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = this.theme;
    document.documentElement.style.colorScheme = this.theme;
    const nextTheme = this.theme === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const label = `Switch to ${nextTheme} theme`;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.setAttribute("aria-pressed", String(this.theme === "light"));
    });
    try { localStorage.setItem(STORAGE_THEME_KEY, this.theme); } catch (e) { warnStorage(e); }
  }

  toggleTheme() {
    this.applyTheme(this.theme === "dark" ? "light" : "dark");
  }

  t(key, fallback = "") {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS.ro;
    if (dict[key] !== undefined) return dict[key];
    if (!this._missingKeys) this._missingKeys = new Set();
    if (!this._missingKeys.has(key)) {
      this._missingKeys.add(key);
      console.warn(`[i18n] missing key "${key}" (${this.currentLang})`);
    }
    return fallback || key;
  }

  setLanguage(lang) {
    if (lang !== "ro" && lang !== "en") lang = "ro";
    this.saveLanguage(lang);
    this.applyLanguage(lang, true);
  }

  applyLanguage(lang, reRenderViews = true) {
    document.documentElement.lang = lang;

    // Update all elements with data-i18n attribute
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const k = el.dataset.i18n;
      if (k) el.textContent = this.t(k);
    });

    // Update all language toggle buttons
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });

    // 1. Universal Top Navigation Bar
    const brandTitle = document.querySelector(".nav-brand-title span");
    if (brandTitle) brandTitle.textContent = this.t("nav_brand");
    const navEventsLabel = this.dom.navEventsBtn?.querySelector(".nav-tab-label");
    if (navEventsLabel) navEventsLabel.textContent = this.t("nav_events");
    const navScheduleLabel = this.dom.navScheduleBtn?.querySelector(".nav-tab-label");
    if (navScheduleLabel) navScheduleLabel.textContent = this.t("nav_schedule");
    const navMyEventsLabel = this.dom.navMyEventsBtn?.querySelector(".nav-tab-label");
    if (navMyEventsLabel) navMyEventsLabel.textContent = this.t("nav_my_events");
    const navSocialLabel = this.dom.navSocialBtn?.querySelector(".nav-tab-label");
    if (navSocialLabel) navSocialLabel.textContent = this.t("nav_social");
    if (this.dom.navAdminBtn) {
      const navAdminLabel = this.dom.navAdminBtn.querySelector(".nav-tab-label");
      const quotaBadge = document.getElementById("nav-admin-quota-badge");
      if (navAdminLabel) navAdminLabel.textContent = this.t("nav_admin");
      this.dom.navAdminBtn.title = this.t("nav_admin");
      this.dom.navAdminBtn.setAttribute("aria-label", this.t("nav_admin"));
      if (quotaBadge) quotaBadge.title = this.t("nav_quota_alert_tooltip");
    }
    if (this.dom.navLogoutBtn) {
      this.dom.navLogoutBtn.textContent = this.t("nav_logout");
    }

    // 2. Direct Login View
    const dlTitle = document.querySelector(".direct-login-title");
    if (dlTitle) dlTitle.textContent = this.t("direct_login_title");
    const dlSubtitle = document.querySelector(".direct-login-subtitle");
    if (dlSubtitle) dlSubtitle.textContent = this.t("direct_login_subtitle");
    const dlUserLabel = document.querySelector("label[for='direct-login-username']");
    if (dlUserLabel) dlUserLabel.textContent = this.t("direct_login_username_label");
    if (this.dom.directLoginUsername) this.dom.directLoginUsername.placeholder = this.t("direct_login_username_placeholder");
    const dlPassLabel = document.querySelector("label[for='direct-login-password']");
    if (dlPassLabel) dlPassLabel.textContent = this.t("direct_login_password_label");
    if (this.dom.directLoginPassword) this.dom.directLoginPassword.placeholder = this.t("direct_login_password_placeholder");
    const dlDemoTitle = document.querySelector("#direct-login-view .quick-demo-logins span");
    if (dlDemoTitle) dlDemoTitle.textContent = this.t("direct_login_demo_title");
    const demoLabels = {
      demo: "direct_login_demo_user",
      demo_admin: "direct_login_demo_admin"
    };
    document.querySelectorAll("#direct-login-view .direct-demo-chip, #login-dialog .btn-demo-chip").forEach(btn => {
      const userKey = btn.dataset.user;
      if (demoLabels[userKey]) {
        btn.textContent = this.t(demoLabels[userKey]);
      }
    });
    const dlSubmitBtn = document.querySelector("#direct-login-form button[type='submit']");
    if (dlSubmitBtn) dlSubmitBtn.textContent = this.t("direct_login_submit");

    const notifLabels = { all: "notif_filter_all", pending: "notif_filter_pending", promoted: "notif_filter_posted" };
    document.querySelectorAll("[data-notif-filter-label]").forEach(label => {
      label.textContent = this.t(notifLabels[label.dataset.notifFilterLabel]);
    });

    // 3. Social Media Calendar Sub-App
    const smcTitle = document.querySelector("#social-calendar-app .header-main-title");
    if (smcTitle) smcTitle.textContent = this.t("social_title");
    if (this.dom.prevMonthBtn) this.dom.prevMonthBtn.title = this.t("social_prev_month");
    if (this.dom.nextMonthBtn) this.dom.nextMonthBtn.title = this.t("social_next_month");
    if (this.dom.todayBtn) this.dom.todayBtn.textContent = this.t("social_today_btn");
    if (this.dom.viewMonthBtn) {
      this.dom.viewMonthBtn.textContent = this.t("social_view_calendar");
      this.dom.viewMonthBtn.title = this.t("social_view_calendar");
    }
    if (this.dom.viewYearBtn) {
      this.dom.viewYearBtn.textContent = this.t("social_view_year");
      this.dom.viewYearBtn.title = this.t("social_view_year");
    }
    if (this.dom.viewFeedBtn) {
      this.dom.viewFeedBtn.textContent = this.t("social_view_feed");
      this.dom.viewFeedBtn.title = this.t("social_view_feed");
    }
    const openControlPanelLbl = document.getElementById("lbl-open-control-panel") || this.dom.openControlPanelBtn?.querySelector("span");
    if (openControlPanelLbl) openControlPanelLbl.textContent = this.t("social_platforms_btn");
    if (this.dom.openControlPanelBtn) this.dom.openControlPanelBtn.title = this.t("social_platforms_btn");

    if (this.dom.btnSocialEventNotifications) {
      const notifLabel = document.getElementById("lbl-social-event-notifications") || this.dom.btnSocialEventNotifications.querySelector(".event-alerts-label");
      if (notifLabel) notifLabel.textContent = this.t("social_event_alerts_btn");
      this.dom.btnSocialEventNotifications.title = this.t("social_event_alerts_btn");
    }

    const openAddPostLbl = document.getElementById("lbl-open-add-post") || this.dom.openAddPostBtn?.querySelector("span");
    if (openAddPostLbl) openAddPostLbl.textContent = this.t("social_new_post_btn");
    if (this.dom.openAddPostBtn) this.dom.openAddPostBtn.title = this.t("social_new_post_btn");

    if (this.dom.socialSearchInput) {
      this.dom.socialSearchInput.placeholder = this.t("social_search_placeholder");
    }
    const footerStandardsLink = document.getElementById("link-footer-standards");
    if (footerStandardsLink) footerStandardsLink.textContent = this.t("social_standards_footer_link");

    // Update weekday headers in calendar grid
    const socialWeekdays = document.querySelectorAll("#calendar-view .calendar-weekdays .weekday");
    const weekdayKeys = ["weekday_mon", "weekday_tue", "weekday_wed", "weekday_thu", "weekday_fri", "weekday_sat", "weekday_sun"];
    socialWeekdays.forEach((wd, idx) => {
      if (weekdayKeys[idx]) wd.textContent = this.t(weekdayKeys[idx]);
    });

    const eventsWeekdays = document.querySelectorAll("#events-grid-view .calendar-weekdays .weekday");
    eventsWeekdays.forEach((wd, idx) => {
      if (weekdayKeys[idx]) wd.textContent = this.t(weekdayKeys[idx]);
    });

    // 5. Events Calendar Sub-App
    const evTitle = document.querySelector("#events-calendar-app .header-main-title");
    if (evTitle) evTitle.textContent = this.t("events_title");
    if (this.dom.eventsPrevMonthBtn) this.dom.eventsPrevMonthBtn.title = this.t("events_prev_period");
    if (this.dom.eventsNextMonthBtn) this.dom.eventsNextMonthBtn.title = this.t("events_next_period");
    if (this.dom.eventsTodayBtn) this.dom.eventsTodayBtn.textContent = this.t("events_today_btn");
    if (this.dom.btnZoomOut) this.dom.btnZoomOut.title = this.t("events_zoom_out");
    if (this.dom.btnZoomIn) this.dom.btnZoomIn.title = this.t("events_zoom_in");
    if (this.dom.btnZoomYearly) this.dom.btnZoomYearly.textContent = this.t("events_zoom_year");
    if (this.dom.btnZoomMonthly) this.dom.btnZoomMonthly.textContent = this.t("events_zoom_month");
    if (this.dom.btnZoomDaily) this.dom.btnZoomDaily.textContent = this.t("events_zoom_day");

    const openAddEventLbl = document.getElementById("lbl-open-add-event") || this.dom.openAddEventBtn?.querySelector("span");
    if (openAddEventLbl) openAddEventLbl.textContent = this.t("events_schedule_btn");
    if (this.dom.openAddEventBtn) this.dom.openAddEventBtn.title = this.t("events_schedule_btn");

    // 6. Admin Panel
    const adminH1 = document.querySelector(".admin-header-bar .brand-info h1");
    if (adminH1) adminH1.textContent = this.t("admin_title");
    const statLabels = document.querySelectorAll(".admin-top-stats .admin-stat-label");
    if (statLabels[0]) statLabels[0].textContent = this.t("admin_stat_users");
    if (statLabels[1]) statLabels[1].textContent = this.t("admin_stat_events");

    if (this.dom.quotaBannerTitle) this.dom.quotaBannerTitle.textContent = this.t("admin_quota_alert_title");
    if (this.dom.quotaBannerDesc) this.dom.quotaBannerDesc.textContent = this.t("admin_quota_alert_desc");
    if (this.dom.btnQuotaBannerCleanup) this.dom.btnQuotaBannerCleanup.textContent = this.t("admin_quota_cleanup_btn");

    const adminSec1H2 = document.querySelector(".admin-card:nth-of-type(1) .admin-card-header h2");
    if (adminSec1H2) adminSec1H2.textContent = this.t("admin_sec_users_title");
    const adminSec1Badge = document.querySelector(".admin-card:nth-of-type(1) .admin-card-header .badge-subtle");
    if (adminSec1Badge) adminSec1Badge.textContent = this.t("admin_sec_users_sub");

    const adminFnLabel = document.querySelector("label[for='new-user-fullname']");
    if (adminFnLabel) adminFnLabel.textContent = this.t("admin_fullname_label");
    if (this.dom.newUserFullname) this.dom.newUserFullname.placeholder = this.t("admin_fullname_placeholder");
    const adminUnLabel = document.querySelector("label[for='new-user-username']");
    if (adminUnLabel) adminUnLabel.textContent = this.t("admin_user_username_label");
    if (this.dom.newUserUsername) this.dom.newUserUsername.placeholder = this.t("admin_user_username_placeholder");
    const adminPwLabel = document.querySelector("label[for='new-user-password']");
    if (adminPwLabel) adminPwLabel.textContent = this.t("admin_user_pass_label");
    if (this.dom.newUserPassword) this.dom.newUserPassword.placeholder = this.t("admin_user_pass_placeholder");
    const adminRlLabel = document.querySelector("label[for='new-user-role']");
    if (adminRlLabel) adminRlLabel.textContent = this.t("admin_user_role_label");
    const adminRoleOpts = document.querySelectorAll("#new-user-role option");
    if (adminRoleOpts[0]) adminRoleOpts[0].textContent = this.t("admin_role_standard");
    if (adminRoleOpts[1]) adminRoleOpts[1].textContent = this.t("admin_role_admin");
    const adminCreateBtn = document.querySelector("#create-user-form button[type='submit']");
    if (adminCreateBtn) adminCreateBtn.textContent = this.t("admin_create_user_btn");

    const userTableThs = document.querySelectorAll(".admin-card:nth-of-type(1) .standards-table th");
    const utKeys = ["admin_th_user", "admin_th_username", "admin_th_role", "admin_th_events_count", "admin_th_created", "admin_th_actions"];
    userTableThs.forEach((th, idx) => {
      if (utKeys[idx]) th.textContent = this.t(utKeys[idx]);
    });

    const adminSec2H2 = document.querySelector(".admin-card:nth-of-type(2) .admin-card-header h2");
    if (adminSec2H2) adminSec2H2.textContent = this.t("admin_sec_audit_title");
    const adminSec2Badge = document.querySelector(".admin-card:nth-of-type(2) .admin-card-header .badge-subtle");
    if (adminSec2Badge) adminSec2Badge.textContent = this.t("admin_sec_audit_sub");

    const auditTableThs = document.querySelectorAll(".admin-card:nth-of-type(2) .standards-table th");
    const atKeys = ["admin_th_datetime", "admin_th_title", "admin_th_social_status", "admin_th_organizer", "admin_th_enroll_price", "admin_th_actions"];
    auditTableThs.forEach((th, idx) => {
      if (atKeys[idx]) th.textContent = this.t(atKeys[idx]);
    });

    const adminSec4H2 = document.querySelector("#admin-storage-section .admin-card-header h2");
    if (adminSec4H2) adminSec4H2.textContent = this.t("admin_sec_storage_title");
    if (this.dom.adminQuotaLimitBadge) this.dom.adminQuotaLimitBadge.textContent = this.t("admin_storage_cap_badge");
    if (this.dom.btnOpenStorageCleanup) this.dom.btnOpenStorageCleanup.textContent = this.t("admin_storage_cleanup_tools_btn");

    const breakdownLabels = document.querySelectorAll(".storage-breakdown-item .breakdown-label");
    if (breakdownLabels[0]) breakdownLabels[0].textContent = this.t("admin_breakdown_events");
    if (breakdownLabels[1]) breakdownLabels[1].textContent = this.t("admin_breakdown_posts");
    if (breakdownLabels[2]) breakdownLabels[2].textContent = this.t("admin_breakdown_free");

    const simToolbarSpan = document.querySelector(".storage-sim-toolbar span");
    if (simToolbarSpan) simToolbarSpan.textContent = this.t("admin_sim_toolbar");
    if (this.dom.btnSimNormal) this.dom.btnSimNormal.textContent = this.t("admin_sim_normal");
    if (this.dom.btnSimWarning) this.dom.btnSimWarning.textContent = this.t("admin_sim_warning");
    if (this.dom.btnSimCritical) this.dom.btnSimCritical.textContent = this.t("admin_sim_critical");
    if (this.dom.btnSimReset) this.dom.btnSimReset.textContent = this.t("admin_sim_reset");

    // 7. Modals / Dialogs
    // Notif Modal
    const notifTitle = document.getElementById("social-notifications-title");
    if (notifTitle) notifTitle.textContent = this.t("notif_modal_title");
    const notifDesc = document.querySelector("#social-notifications-modal .dialog-header p");
    if (notifDesc) notifDesc.textContent = this.t("notif_modal_desc");
    const notifCloseDoneBtn = document.getElementById("close-social-notifications-done-btn");
    if (notifCloseDoneBtn) notifCloseDoneBtn.textContent = this.t("cleanup_done_btn");

    // Storage Cleanup Modal
    const cleanupTitle = document.getElementById("storage-cleanup-title");
    if (cleanupTitle) cleanupTitle.textContent = this.t("cleanup_modal_title");
    const cleanupDesc = document.querySelector("#storage-cleanup-dialog .dialog-header p");
    if (cleanupDesc) cleanupDesc.textContent = this.t("cleanup_modal_desc");
    const cleanupCurCardTitle = document.querySelector(".cleanup-storage-card span");
    if (cleanupCurCardTitle) cleanupCurCardTitle.textContent = this.t("cleanup_current_usage");
    if (this.dom.btnExecuteCleanupEvents) this.dom.btnExecuteCleanupEvents.textContent = this.t("cleanup_btn_del_events");
    if (this.dom.btnExecuteStripImages) this.dom.btnExecuteStripImages.textContent = this.t("cleanup_btn_strip_images");
    if (this.dom.btnExecuteCleanupSocial) this.dom.btnExecuteCleanupSocial.textContent = this.t("cleanup_btn_purge_social");
    if (this.dom.closeStorageCleanupDoneBtn) this.dom.closeStorageCleanupDoneBtn.textContent = this.t("cleanup_done_btn");

    // Login Dialog
    const loginTitle = document.getElementById("login-dialog-title");
    if (loginTitle) loginTitle.innerHTML = `<span>${this.t("login_modal_title")}</span>`;
    const loginSub = document.getElementById("login-dialog-subtitle");
    if (loginSub) loginSub.textContent = this.t("login_modal_sub");
    const loginUnLabel = document.querySelector("label[for='login-username']");
    if (loginUnLabel) loginUnLabel.textContent = this.t("login_username_label");
    const loginPwLabel = document.querySelector("label[for='login-password']");
    if (loginPwLabel) loginPwLabel.textContent = this.t("login_password_label");
    const loginDemoSpan = document.querySelector("#login-dialog .quick-demo-logins span");
    if (loginDemoSpan) loginDemoSpan.textContent = this.t("direct_login_demo_title");
    if (this.dom.cancelLoginBtn) this.dom.cancelLoginBtn.textContent = this.t("login_cancel_btn");
    if (this.dom.loginSubmitBtn) this.dom.loginSubmitBtn.textContent = this.t("login_submit_btn");

    // Schedule Page & My Events Page
    if (this.dom.myEventsPageTitle) this.dom.myEventsPageTitle.textContent = this.t("my_events_title");
    if (this.dom.myEventsSubtitle) this.dom.myEventsSubtitle.textContent = this.t("my_events_sub");
    const myEventsCreateLbl = document.getElementById("lbl-my-events-create-new");
    if (myEventsCreateLbl) myEventsCreateLbl.textContent = this.t("my_events_create_new");
    const filterAllBtn = document.getElementById("filter-my-events-all");
    if (filterAllBtn) filterAllBtn.textContent = this.t("my_events_filter_all");
    const filterPublicBtn = document.getElementById("filter-my-events-public");
    if (filterPublicBtn) filterPublicBtn.textContent = this.t("my_events_filter_public");
    const filterRoomBtn = document.getElementById("filter-my-events-room");
    if (filterRoomBtn) {
      filterRoomBtn.textContent = this.t("my_events_filter_room");
      filterRoomBtn.style.display = this.canBookRooms() ? "inline-flex" : "none";
    }
    const filterLockedBtn = document.getElementById("filter-my-events-locked");
    if (filterLockedBtn) filterLockedBtn.textContent = this.t("my_events_filter_locked");
    if (this.dom.myEventsSearchInput) this.dom.myEventsSearchInput.placeholder = this.t("my_events_search_placeholder");
    if (this.activeApp === "events" && this.eventsLayoutMode === "my-events") {
      this.renderMyEventsPage();
    }
    const evDialogTitleLabel = document.querySelector("label[for='event-title-input']");
    if (evDialogTitleLabel) evDialogTitleLabel.textContent = this.t("dropin_title_label");
    const evDialogDateLabel = document.querySelector("label[for='event-date-input']");
    if (evDialogDateLabel) evDialogDateLabel.textContent = this.t("dropin_date_label");
    const evDialogRecurrentLabel = document.querySelector("#event-form .recurrence-box label.checkbox-label span");
    if (evDialogRecurrentLabel) evDialogRecurrentLabel.textContent = this.t("dropin_recurrent_label");
    const evDialogRecurrentRepeat = document.querySelector("label[for='event-recurrence-months']");
    if (evDialogRecurrentRepeat) evDialogRecurrentRepeat.textContent = this.t("dropin_recurrent_repeat");
    const evDialogMatrixLabel = document.querySelector("#event-free-hours-board")?.previousElementSibling?.querySelector("label");
    if (evDialogMatrixLabel) evDialogMatrixLabel.textContent = this.t("event_matrix_label");
    const evDialogMatrixHint = document.querySelector("#event-free-hours-board")?.previousElementSibling?.querySelector("span");
    if (evDialogMatrixHint) evDialogMatrixHint.textContent = this.t("event_matrix_hint");
    const evTimingLegend = document.querySelector("#event-timing-mode legend");
    if (evTimingLegend) evTimingLegend.textContent = this.t("event_timing_mode_label");
    document.querySelectorAll("input[name='event-timing-mode']").forEach(input => {
      const label = input.closest("label");
      if (label) label.lastChild.textContent = ` ${this.t(input.value === "async" ? "event_timing_async" : "event_timing_consecutive")}`;
    });
    const evDialogCreatorLabel = document.querySelector("label[for='event-creator-display']");
    if (evDialogCreatorLabel) evDialogCreatorLabel.textContent = this.t("event_scheduled_by_label");
    const evDialogHourLabel = document.querySelector("label[for='event-hour-input']");
    if (evDialogHourLabel) evDialogHourLabel.textContent = this.t("dropin_hour_label");
    const evDialogDurLabel = document.querySelector("label[for='event-duration-input']");
    if (evDialogDurLabel) evDialogDurLabel.textContent = this.t("dropin_duration_label");
    const evDialogPriceLabel = document.querySelector("label[for='event-price-input']");
    if (evDialogPriceLabel) evDialogPriceLabel.textContent = this.t("dropin_price_label");
    const evDialogEnrollLabel = document.querySelector("label[for='event-enroll-input']");
    if (evDialogEnrollLabel) evDialogEnrollLabel.textContent = this.t("dropin_enroll_label");
    const evDialogFbLabel = document.querySelector("label[for='event-fb-image-file']");
    if (evDialogFbLabel) evDialogFbLabel.textContent = this.t("dropin_fb_image_label");
    if (this.dom.btnUseFbSample) this.dom.btnUseFbSample.textContent = this.t("dropin_use_sample_btn");
    const evDialogDescLabel = document.querySelector("label[for='event-desc-input']");
    if (evDialogDescLabel) evDialogDescLabel.textContent = this.t("dropin_desc_label");
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
    const evDetailTitle = document.getElementById("event-detail-title");
    if (evDetailTitle) evDetailTitle.textContent = this.t("event_detail_title");
    if (this.dom.eventDetailDaysBadge) this.dom.eventDetailDaysBadge.textContent = this.t("event_detail_single_day");
    if (this.dom.eventDetailRecurrentBadge) this.dom.eventDetailRecurrentBadge.textContent = this.t("event_detail_recurrent");
    const evDetailMetaItems = document.querySelectorAll("#event-detail-dialog .detail-meta-item span");
    if (evDetailMetaItems[0]) evDetailMetaItems[0].textContent = this.t("event_detail_meta_dt");
    if (evDetailMetaItems[1]) evDetailMetaItems[1].textContent = this.t("event_detail_meta_price");
    if (this.dom.eventDetailDeleteBtn) this.dom.eventDetailDeleteBtn.textContent = this.t("event_detail_delete_btn");
    if (this.dom.eventDetailEditBtn) this.dom.eventDetailEditBtn.textContent = this.t("event_detail_edit_btn");
    if (this.dom.closeEventDetailDoneBtn) this.dom.closeEventDetailDoneBtn.textContent = this.t("event_detail_close_btn");

    // Post Dialog
    const postPlatLabel = document.querySelector("label[for='post-platform-select']");
    if (postPlatLabel) postPlatLabel.textContent = this.t("post_platform_label");
    const postTypeLabel = document.querySelector("label[for='post-type-select']");
    if (postTypeLabel) postTypeLabel.textContent = this.t("post_type_label");
    const postSpecTitle = document.getElementById("spec-summary-title");
    if (postSpecTitle) postSpecTitle.textContent = this.t("post_spec_title");
    const postDateLabel = document.querySelector("label[for='post-date-input']");
    if (postDateLabel) postDateLabel.textContent = this.t("post_date_label");
    const postTimeLabel = document.querySelector("label[for='post-time-input']");
    if (postTimeLabel) postTimeLabel.textContent = this.t("post_time_label");
    const postTitleLabel = document.querySelector("label[for='post-title-input']");
    if (postTitleLabel) postTitleLabel.textContent = this.t("post_title_label");
    const postShareLabel = document.querySelector("label[for='post-share-link']");
    if (postShareLabel) postShareLabel.textContent = this.t("post_share_label");
    if (this.dom.btnTestShareLink) this.dom.btnTestShareLink.textContent = this.t("post_test_share_btn");
    const postDescLabel = document.querySelector("label[for='post-desc-input']");
    if (postDescLabel) postDescLabel.textContent = this.t("post_desc_label");
    const postStatusLabel = document.querySelector("label[for='post-status-select']");
    if (postStatusLabel) postStatusLabel.textContent = this.t("post_status_label");
    if (this.dom.cancelPostDialogBtn) this.dom.cancelPostDialogBtn.textContent = this.t("post_cancel_btn");
    if (this.dom.savePostBtn) this.dom.savePostBtn.textContent = this.t("post_save_btn");

    // Post Detail Dialog
    const postDetailHeading = document.getElementById("detail-dialog-title");
    if (postDetailHeading) postDetailHeading.textContent = this.t("post_detail_title");
    const postDetailMetaSpans = document.querySelectorAll("#detail-dialog .detail-meta-item span");
    if (postDetailMetaSpans[0]) postDetailMetaSpans[0].textContent = this.t("post_detail_dt");
    if (postDetailMetaSpans[1]) postDetailMetaSpans[1].textContent = this.t("post_detail_type_ratio");
    if (postDetailMetaSpans[2]) postDetailMetaSpans[2].textContent = this.t("post_detail_media_format");
    if (postDetailMetaSpans[3]) postDetailMetaSpans[3].textContent = this.t("post_detail_status");
    if (this.dom.btnDetailCopyShare) this.dom.btnDetailCopyShare.textContent = this.t("post_detail_copy_share_btn");
    if (this.dom.btnDetailOpenShare) this.dom.btnDetailOpenShare.textContent = this.t("post_detail_open_share_btn");
    if (this.dom.detailDeleteBtn) this.dom.detailDeleteBtn.textContent = this.t("post_detail_delete_btn");
    if (this.dom.detailDuplicateBtn) this.dom.detailDuplicateBtn.textContent = this.t("post_detail_duplicate_btn");
    if (this.dom.detailEditBtn) this.dom.detailEditBtn.textContent = this.t("post_detail_edit_btn");

    // Control Panel Dialog
    const cpTitle = document.getElementById("cp-dialog-title");
    if (cpTitle) cpTitle.innerHTML = `<span>${this.t("cp_title")}</span>`;
    if (this.dom.btnCpHeaderAddPlatform) this.dom.btnCpHeaderAddPlatform.textContent = this.t("cp_add_title");
    const cpAddSummary = document.querySelector("#cp-add-platform-details summary") || document.querySelector("#control-panel-dialog details summary");
    if (cpAddSummary) cpAddSummary.textContent = this.t("cp_add_title");
    const cpNameLabel = document.querySelector("label[for='new-platform-name']");
    if (cpNameLabel) cpNameLabel.textContent = this.t("cp_platform_name");
    const cpColorLabel = document.querySelector("label[for='new-platform-color']");
    if (cpColorLabel) cpColorLabel.textContent = this.t("cp_brand_color");
    const cpDomainLabel = document.querySelector("label[for='new-platform-domain']");
    if (cpDomainLabel) cpDomainLabel.textContent = this.t("cp_domain");
    const cpDescLabel = document.querySelector("label[for='new-platform-desc']");
    if (cpDescLabel) cpDescLabel.textContent = this.t("cp_description");
    const cpAddBtn = document.querySelector("#add-platform-form button[type='submit']");
    if (cpAddBtn) cpAddBtn.textContent = this.t("cp_add_btn");
    if (this.dom.cpResetDefaultsBtn) this.dom.cpResetDefaultsBtn.textContent = this.t("cp_reset_btn");
    if (this.dom.cpExportBtn) this.dom.cpExportBtn.textContent = this.t("cp_export_btn");
    if (this.dom.cpImportBtn) this.dom.cpImportBtn.textContent = this.t("cp_import_btn");
    if (this.dom.closeCpDoneBtn) this.dom.closeCpDoneBtn.textContent = this.t("cp_done_btn");

    // Standards Matrix Dialog
    const standardsTitle = document.getElementById("standards-dialog-title");
    if (standardsTitle) standardsTitle.innerHTML = `<span>${this.t("standards_title")}</span>`;
    const standardsDesc = document.querySelector("#standards-dialog .dialog-body > p");
    if (standardsDesc) standardsDesc.textContent = this.t("standards_desc");
    const stThs = document.querySelectorAll("#standards-dialog .standards-table th");
    const stKeys = ["standards_th_platform", "standards_th_type", "standards_th_ratio", "standards_th_res", "standards_th_format", "standards_th_specs"];
    stThs.forEach((th, idx) => {
      if (stKeys[idx]) th.textContent = this.t(stKeys[idx]);
    });
    if (this.dom.closeStandardsDoneBtn) this.dom.closeStandardsDoneBtn.textContent = this.t("standards_close_btn");

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
    document.documentElement.lang = this.currentLang;

    // Weekend watermark CSS variable
    document.documentElement.style.setProperty('--weekend-label', '"' + this.t("weekend_label") + '"');

    // Edit User Dialog
    const editUserTitle = document.querySelector("#edit-user-dialog .dialog-header h2");
    if (editUserTitle) editUserTitle.textContent = this.t("edit_user_title");
    const editUserLabels = document.querySelectorAll("#edit-user-dialog .form-label");
    if (editUserLabels[0]) editUserLabels[0].textContent = this.t("edit_user_name_label");
    if (editUserLabels[1]) editUserLabels[1].textContent = this.t("edit_user_username_label");
    if (editUserLabels[2]) editUserLabels[2].textContent = this.t("edit_user_pass_label");
    if (editUserLabels[3]) editUserLabels[3].textContent = this.t("edit_user_role_label");
    const editUserRoleOpts = document.querySelectorAll("#edit-user-role option");
    if (editUserRoleOpts[0]) editUserRoleOpts[0].textContent = this.t("edit_user_role_user");
    if (editUserRoleOpts[1]) editUserRoleOpts[1].textContent = this.t("edit_user_role_admin");
    const editUserBtns = document.querySelectorAll("#edit-user-dialog .dialog-footer button");
    if (editUserBtns[0]) editUserBtns[0].textContent = this.t("edit_user_cancel");
    if (editUserBtns[1]) editUserBtns[1].textContent = this.t("edit_user_save");
  }

  initElements() {
    this.dom = {
      adminQuotaLimitBadge: document.getElementById("admin-quota-limit-badge"),
      loginSubmitBtn: document.getElementById("login-submit-btn"),
      savePostBtn: document.getElementById("save-post-btn"),
      // Universal Top Navigation Bar
      universalNavBar: document.getElementById("universal-nav-bar"),
      navEventsBtn: document.getElementById("nav-events-btn"),
      navScheduleBtn: document.getElementById("nav-schedule-btn"),
      navMyEventsBtn: document.getElementById("nav-my-events-btn"),
      navMyEventsCountBadge: document.getElementById("nav-my-events-count-badge"),
      navSocialBtn: document.getElementById("nav-social-btn"),
      navAdminBtn: document.getElementById("nav-admin-btn"),
      navUserPill: document.getElementById("nav-user-pill"),
      navUserAvatar: document.getElementById("nav-user-avatar"),
      navUserName: document.getElementById("nav-user-name"),
      navUserRole: document.getElementById("nav-user-role"),
      navLogoutBtn: document.getElementById("nav-logout-btn"),

      // Direct Login View
      directLoginView: document.getElementById("direct-login-view"),
      directLoginForm: document.getElementById("direct-login-form"),
      directLoginUsername: document.getElementById("direct-login-username"),
      directLoginPassword: document.getElementById("direct-login-password"),
      directLoginErrorMsg: document.getElementById("direct-login-error-msg"),

      // Sub-App Containers
      socialCalendarApp: document.getElementById("social-calendar-app"),
      eventsCalendarApp: document.getElementById("events-calendar-app"),
      adminApp: document.getElementById("admin-app"),

      // Social Calendar Navigation & Views
      prevMonthBtn: document.getElementById("prev-month-btn"),
      nextMonthBtn: document.getElementById("next-month-btn"),
      todayBtn: document.getElementById("today-btn"),
      currentMonthLabel: document.getElementById("current-month-label"),
      platformFilterBar: document.getElementById("platform-filter-bar"),
      socialSearchInput: document.getElementById("social-search-input"),
      viewMonthBtn: document.getElementById("view-month-btn"),
      viewYearBtn: document.getElementById("view-year-btn"),
      viewFeedBtn: document.getElementById("view-feed-btn"),
      calendarView: document.getElementById("calendar-view"),
      socialYearView: document.getElementById("social-year-view"),
      socialYearMonthsGrid: document.getElementById("social-year-months-grid"),
      feedView: document.getElementById("feed-view"),
      calendarDaysGrid: document.getElementById("calendar-days-grid"),

      // Banner stats
      bannerActivePlatform: document.getElementById("banner-active-platform"),
      bannerPostCount: document.getElementById("banner-post-count"),
      bannerMonthName: document.getElementById("banner-month-name"),

      // Social Action Buttons
      openAddPostBtn: document.getElementById("open-add-post-btn"),
      linkFooterStandards: document.getElementById("link-footer-standards"),
      openControlPanelBtn: document.getElementById("open-control-panel-btn"),
      btnSocialEventNotifications: document.getElementById("btn-social-event-notifications"),
      socialNotificationsCount: document.getElementById("social-notifications-count"),
      socialNotificationsModal: document.getElementById("social-notifications-modal"),
      closeSocialNotificationsBtn: document.getElementById("close-social-notifications-btn"),
      closeSocialNotificationsDoneBtn: document.getElementById("close-social-notifications-done-btn"),
      socialNotificationsList: document.getElementById("social-notifications-list"),
      notifCountAll: document.getElementById("notif-count-all"),
      notifCountPending: document.getElementById("notif-count-pending"),
      notifCountPromoted: document.getElementById("notif-count-promoted"),

      // Post Dialog
      postDialog: document.getElementById("post-dialog"),
      postDialogActionText: document.getElementById("post-dialog-action-text"),
      closePostDialogBtn: document.getElementById("close-post-dialog-btn"),
      cancelPostDialogBtn: document.getElementById("cancel-post-dialog-btn"),
      postForm: document.getElementById("post-form"),
      postEditId: document.getElementById("post-edit-id"),
      postPlatformSelect: document.getElementById("post-platform-select"),
      postTypeSelect: document.getElementById("post-type-select"),
      liveSpecHelper: document.getElementById("live-spec-helper"),
      specSummaryTitle: document.getElementById("spec-summary-title"),
      specSummaryBadge: document.getElementById("spec-summary-badge"),
      postDateInput: document.getElementById("post-date-input"),
      postTimeInput: document.getElementById("post-time-input"),
      postTitleInput: document.getElementById("post-title-input"),
      postDescInput: document.getElementById("post-desc-input"),
      postStatusSelect: document.getElementById("post-status-select"),
      captionCounter: document.getElementById("caption-counter"),
      
      // Media controls
      mediaDropZone: document.getElementById("media-drop-zone"),
      mediaFileInput: document.getElementById("media-file-input"),
      mediaUrlInput: document.getElementById("media-url-input"),
      applyUrlBtn: document.getElementById("apply-url-btn"),
      previewImg: document.getElementById("preview-img"),
      previewVideo: document.getElementById("preview-video"),
      previewMediaName: document.getElementById("preview-media-name"),
      previewAspectPill: document.getElementById("preview-aspect-pill"),
      postShareLink: document.getElementById("post-share-link"),
      btnTestShareLink: document.getElementById("btn-test-share-link"),

      // Post Detail Dialog
      detailDialog: document.getElementById("detail-dialog"),
      closeDetailDialogBtn: document.getElementById("close-detail-dialog-btn"),
      detailMediaBox: document.getElementById("detail-media-box"),
      detailPlatformBadge: document.getElementById("detail-platform-badge"),
      detailTitle: document.getElementById("detail-title"),
      detailDateTime: document.getElementById("detail-date-time"),
      detailPostType: document.getElementById("detail-post-type"),
      detailMediaFormat: document.getElementById("detail-media-format"),
      detailStatus: document.getElementById("detail-status"),
      detailShareBox: document.getElementById("detail-share-box"),
      detailShareLinkText: document.getElementById("detail-share-link-text"),
      detailShareStatusBadge: document.getElementById("detail-share-status-badge"),
      btnDetailCopyShare: document.getElementById("btn-detail-copy-share"),
      btnDetailOpenShare: document.getElementById("btn-detail-open-share"),
      detailDescBox: document.getElementById("detail-desc-box"),
      detailEditBtn: document.getElementById("detail-edit-btn"),
      detailDuplicateBtn: document.getElementById("detail-duplicate-btn"),
      detailDeleteBtn: document.getElementById("detail-delete-btn"),

      // Control Panel Dialog
      controlPanelDialog: document.getElementById("control-panel-dialog"),
      btnCpHeaderAddPlatform: document.getElementById("btn-cp-header-add-platform"),
      cpAddPlatformDetails: document.getElementById("cp-add-platform-details"),
      closeCpDialogBtn: document.getElementById("close-cp-dialog-btn"),
      closeCpDoneBtn: document.getElementById("close-cp-done-btn"),
      cpPlatformsList: document.getElementById("cp-platforms-list"),
      addPlatformForm: document.getElementById("add-platform-form"),
      newPlatformName: document.getElementById("new-platform-name"),
      newPlatformColor: document.getElementById("new-platform-color"),
      newPlatformDomain: document.getElementById("new-platform-domain"),
      newPlatformDesc: document.getElementById("new-platform-desc"),
      cpResetDefaultsBtn: document.getElementById("cp-reset-defaults-btn"),
      cpExportBtn: document.getElementById("cp-export-btn"),
      cpImportBtn: document.getElementById("cp-import-btn"),
      cpImportFileInput: document.getElementById("cp-import-file-input"),

      // Standards Matrix Dialog
      standardsDialog: document.getElementById("standards-dialog"),
      closeStandardsDialogBtn: document.getElementById("close-standards-dialog-btn"),
      closeStandardsDoneBtn: document.getElementById("close-standards-done-btn"),
      standardsTableBody: document.getElementById("standards-table-body"),

      // Login Dialog
      loginDialog: document.getElementById("login-dialog"),
      closeLoginDialogBtn: document.getElementById("close-login-dialog-btn"),
      cancelLoginBtn: document.getElementById("cancel-login-btn"),
      loginForm: document.getElementById("login-form"),
      loginSubtitle: document.getElementById("login-dialog-subtitle"),
      loginUsername: document.getElementById("login-username"),
      loginPassword: document.getElementById("login-password"),
      loginErrorMsg: document.getElementById("login-error-msg"),

      // Events Calendar App Elements
      eventsZoomControl: document.getElementById("events-zoom-control"),
      btnZoomOut: document.getElementById("btn-zoom-out"),
      btnZoomDaily: document.getElementById("btn-zoom-daily"),
      btnZoomMonthly: document.getElementById("btn-zoom-monthly"),
      btnZoomYearly: document.getElementById("btn-zoom-yearly"),
      btnZoomIn: document.getElementById("btn-zoom-in"),
      eventsSimpleDropinView: document.getElementById("events-simple-dropin-view"),
      schedulePageShell: document.getElementById("schedule-page-shell"),
      schedulePageFormHost: document.getElementById("schedule-page-form-host"),
      myEventsPageShell: document.getElementById("my-events-page-shell"),
      myEventsPageTitle: document.getElementById("my-events-page-title"),
      myEventsSubtitle: document.getElementById("my-events-subtitle"),
      myEventsTotalBadge: document.getElementById("my-events-total-badge"),
      btnMyEventsCreateNew: document.getElementById("btn-my-events-create-new"),
      myEventsFilterTabs: document.getElementById("my-events-filter-tabs"),
      myEventsSearchInput: document.getElementById("my-events-search-input"),
      myEventsListContainer: document.getElementById("my-events-list-container"),
      eventsAdvancedPanelView: document.getElementById("events-advanced-panel-view"),

      eventsHeaderBar: document.getElementById("events-header-bar") || document.querySelector("#events-calendar-app .events-header-bar"),
      eventsPrevMonthBtn: document.getElementById("events-prev-month-btn"),
      eventsNextMonthBtn: document.getElementById("events-next-month-btn"),
      eventsTodayBtn: document.getElementById("events-today-btn"),
      eventsCurrentMonthLabel: document.getElementById("events-current-month-label"),
      eventsUserFilterBar: document.getElementById("events-user-filter-bar"),
      openAddEventBtn: document.getElementById("open-add-event-btn"),

      // Zoom Level Views
      eventsDailyView: document.getElementById("events-daily-view"),
      dailyTimelineHeaderBar: document.getElementById("daily-timeline-header-bar"),
      dailyTimelineBody: document.getElementById("daily-timeline-body"),
      eventsGridView: document.getElementById("events-grid-view"),
      eventsDaysGrid: document.getElementById("events-days-grid"),
      eventsYearlyView: document.getElementById("events-yearly-view"),
      yearlyMonthsGrid: document.getElementById("yearly-months-grid"),

      // Event Creation / Edit Dialog & Adaptive Wizard
      eventDialog: document.getElementById("event-dialog"),
      eventDialogFooter: document.getElementById("event-dialog-footer"),
      closeEventDialogBtn: document.getElementById("close-event-dialog-btn"),
      wizardStepsIndicator: document.getElementById("wizard-steps-indicator"),
      wizardStep3Host: document.getElementById("wizard-step-3-host"),
      wizardPrevBtn: document.getElementById("wizard-prev-btn"),
      wizardNextBtn: document.getElementById("wizard-next-btn"),
      saveEventBtn: document.getElementById("save-event-btn"),
      eventSmartSuggestionBox: document.getElementById("event-smart-suggestion-box"),
      smartConflictDetails: document.getElementById("smart-conflict-details"),
      smartSuggestionsList: document.getElementById("smart-suggestions-list"),
      eventDateWarning: document.getElementById("event-date-warning"),
      eventDateWarningMsg: document.getElementById("event-date-warning-msg"),
      eventForm: document.getElementById("event-form"),
      eventEditId: document.getElementById("event-edit-id"),
      eventEntryTypeInput: document.getElementById("event-entry-type"),
      btnEntryTypeEvent: document.getElementById("btn-entry-type-event"),
      btnEntryTypeLocked: document.getElementById("btn-entry-type-locked"),
      btnEntryTypeRoom: document.getElementById("btn-entry-type-room"),
      eventSpaceSelect: document.getElementById("event-space-select"),
      eventSpaceGroup: document.getElementById("event-space-group"),
      eventNeedsRoom: document.getElementById("event-needs-room"),
      eventRoomCategoryBlock: document.getElementById("event-room-category-block"),
      eventRoomCategoryHeader: document.getElementById("event-room-category-header"),
      eventRoomBookingPanel: document.getElementById("event-room-booking-panel"),
      eventRoomBookingsList: document.getElementById("event-room-bookings-list"),
      btnAddRoomBooking: document.getElementById("btn-add-room-booking"),
      eventPricingGroup: document.getElementById("event-pricing-group"),
      eventEnrollGroup: document.getElementById("event-enroll-group"),
      eventFbCoverGroup: document.getElementById("event-fb-cover-group"),
      eventLockedInfoNotice: document.getElementById("event-locked-info-notice"),
      eventRoomOnlyNotice: document.getElementById("event-room-only-info-notice"),
      lblEventTitle: document.getElementById("lbl-event-title"),
      lblEventDesc: document.getElementById("lbl-event-desc"),
      eventTitleInput: document.getElementById("event-title-input"),
      eventCreatorDisplay: document.getElementById("event-creator-display"),
      eventDateGroup: document.getElementById("event-date-group"),
      eventDateInput: document.getElementById("event-date-input"),
      eventHourGroup: document.getElementById("event-hour-group"),
      eventHourInput: document.getElementById("event-hour-input"),
      eventDurationGroup: document.getElementById("event-duration-group"),
      eventDurationInput: document.getElementById("event-duration-input"),
      eventRecurrenceGroup: document.getElementById("event-recurrence-group"),
      eventIsRecurrent: document.getElementById("event-is-recurrent"),
      eventRecurrenceOptions: document.getElementById("event-recurrence-options"),
      eventRecurrenceMonths: document.getElementById("event-recurrence-months"),
      eventRecurrencePreviewHint: document.getElementById("event-recurrence-preview-hint"),
      eventTimingGroup: document.getElementById("event-timing-group"),
      eventFreeHoursBoard: document.getElementById("event-free-hours-board"),
      eventTimingModeInputs: document.querySelectorAll("input[name='event-timing-mode']"),
      eventHoursBoardHint: document.getElementById("event-hours-board-hint"),
      eventPriceInput: document.getElementById("event-price-input"),
      eventPriceCurrency: document.getElementById("event-price-currency"),
      eventEnrollInput: document.getElementById("event-enroll-input"),
      eventFbImageFile: document.getElementById("event-fb-image-file"),
      eventFbImageUrl: document.getElementById("event-fb-image-url"),
      eventFbImageData: document.getElementById("event-fb-image-data"),
      btnUseFbSample: document.getElementById("btn-use-fb-sample"),
      eventFbValidationStatus: document.getElementById("event-fb-validation-status"),
      fbStatusIcon: document.getElementById("fb-status-icon"),
      fbStatusText: document.getElementById("fb-status-text"),
      eventFbPreviewBox: document.getElementById("event-fb-preview-box"),
      eventFbPreviewImg: document.getElementById("event-fb-preview-img"),
      fbPreviewDimsBadge: document.getElementById("fb-preview-dims-badge"),
      eventDescInput: document.getElementById("event-desc-input"),
      eventDialogActionText: document.getElementById("event-dialog-action-text"),

      // Event Detail Dialog
      eventDetailDialog: document.getElementById("event-detail-dialog"),
      closeEventDetailBtn: document.getElementById("close-event-detail-btn"),
      closeEventDetailDoneBtn: document.getElementById("close-event-detail-done-btn"),
      eventDetailFbContainer: document.getElementById("event-detail-fb-container"),
      eventDetailFbImage: document.getElementById("event-detail-fb-image"),
      eventDetailTypeBadge: document.getElementById("event-detail-type-badge"),
      eventDetailSpaceBadge: document.getElementById("event-detail-space-badge"),
      eventDetailRoomBadge: document.getElementById("event-detail-room-badge"),
      eventDetailDaysBadge: document.getElementById("event-detail-days-badge"),
      eventDetailRecurrentBadge: document.getElementById("event-detail-recurrent-badge"),
      eventDetailCreatorPill: document.getElementById("event-detail-creator-pill"),
      eventDetailHeading: document.getElementById("event-detail-heading"),
      eventDetailDatetime: document.getElementById("event-detail-datetime"),
      eventDetailPrice: document.getElementById("event-detail-price"),
      eventDetailPriceItem: document.getElementById("event-detail-price-item"),
      eventDetailSpaceItem: document.getElementById("event-detail-space-item"),
      eventDetailSpaceText: document.getElementById("event-detail-space-text"),
      eventDetailRoomItem: document.getElementById("event-detail-room-item"),
      eventDetailRoomText: document.getElementById("event-detail-room-text"),
      eventDetailDesc: document.getElementById("event-detail-desc"),
      eventDetailEnrollWrap: document.getElementById("event-detail-enroll-wrap"),
      eventDetailEnrollBtn: document.getElementById("event-detail-enroll-btn"),
      eventPermissionNotice: document.getElementById("event-permission-notice"),
      eventDetailEditBtn: document.getElementById("event-detail-edit-btn"),
      eventDetailDeleteBtn: document.getElementById("event-detail-delete-btn"),

      // Admin Panel Elements
      adminUserCount: document.getElementById("admin-user-count"),
      adminEventCount: document.getElementById("admin-event-count"),
      adminCatTabs: document.querySelectorAll("[data-admin-cat]"),
      adminUsersSection: document.getElementById("admin-users-section"),
      adminEventsSection: document.getElementById("admin-events-section"),
      adminSpacesSection: document.getElementById("admin-spaces-section"),
      adminRoomsSection: document.getElementById("admin-rooms-section"),
      adminStorageSection: document.getElementById("admin-storage-section"),
      createUserForm: document.getElementById("create-user-form"),
      newUserFullname: document.getElementById("new-user-fullname"),
      newUserUsername: document.getElementById("new-user-username"),
      newUserPassword: document.getElementById("new-user-password"),
      newUserRole: document.getElementById("new-user-role"),
      adminUsersTableBody: document.getElementById("admin-users-table-body"),
      adminEventsTableBody: document.getElementById("admin-events-table-body"),

      // Admin Spaces & Venues
      createSpaceForm: document.getElementById("create-space-form"),
      newSpaceName: document.getElementById("new-space-name"),
      newSpaceCapacity: document.getElementById("new-space-capacity"),
      newSpaceColor: document.getElementById("new-space-color"),
      newSpaceDesc: document.getElementById("new-space-desc"),
      adminSpacesTableBody: document.getElementById("admin-spaces-table-body"),

      // Admin Accommodation / Sleeping Rooms
      createRoomForm: document.getElementById("create-room-form"),
      newRoomName: document.getElementById("new-room-name"),
      newRoomType: document.getElementById("new-room-type"),
      newRoomCapacity: document.getElementById("new-room-capacity"),
      newRoomBeds: document.getElementById("new-room-beds"),
      newRoomColor: document.getElementById("new-room-color"),
      newRoomNotes: document.getElementById("new-room-notes"),
      adminRoomsTableBody: document.getElementById("admin-rooms-table-body"),

      // Edit User Dialog
      editUserDialog: document.getElementById("edit-user-dialog"),
      closeEditUserBtn: document.getElementById("close-edit-user-btn"),
      cancelEditUserBtn: document.getElementById("cancel-edit-user-btn"),
      editUserForm: document.getElementById("edit-user-form"),
      editUserId: document.getElementById("edit-user-id"),
      editUserFullname: document.getElementById("edit-user-fullname"),
      editUserUsername: document.getElementById("edit-user-username"),
      editUserPassword: document.getElementById("edit-user-password"),
      editUserRole: document.getElementById("edit-user-role"),

      // Storage Quota & Cleanup Elements
      navAdminQuotaBadge: document.getElementById("nav-admin-quota-badge"),
      adminQuotaAlertBanner: document.getElementById("admin-quota-alert-banner"),
      quotaBannerIcon: document.getElementById("quota-banner-icon"),
      quotaBannerTitle: document.getElementById("quota-banner-title"),
      quotaBannerDesc: document.getElementById("quota-banner-desc"),
      btnQuotaBannerCleanup: document.getElementById("btn-quota-banner-cleanup"),
      btnOpenStorageCleanup: document.getElementById("btn-open-storage-cleanup"),
      adminStorageUsedText: document.getElementById("admin-storage-used-text"),
      adminStorageTotalText: document.getElementById("admin-storage-total-text"),
      adminStoragePctBadge: document.getElementById("admin-storage-pct-badge"),
      adminStorageMeterFill: document.getElementById("admin-storage-meter-fill"),
      storageEventsSize: document.getElementById("storage-events-size"),
      storageEventsCount: document.getElementById("storage-events-count"),
      storagePostsSize: document.getElementById("storage-posts-size"),
      storagePostsCount: document.getElementById("storage-posts-count"),
      storageFreeSize: document.getElementById("storage-free-size"),
      storageStatusSub: document.getElementById("storage-status-sub"),
      storageSimToolbar: document.querySelector(".storage-sim-toolbar"),
      btnSimNormal: document.getElementById("btn-sim-normal"),
      btnSimWarning: document.getElementById("btn-sim-warning"),
      btnSimCritical: document.getElementById("btn-sim-critical"),
      btnSimReset: document.getElementById("btn-sim-reset"),

      // Storage Cleanup Modal
      storageCleanupDialog: document.getElementById("storage-cleanup-dialog"),
      closeStorageCleanupBtn: document.getElementById("close-storage-cleanup-btn"),
      closeStorageCleanupDoneBtn: document.getElementById("close-storage-cleanup-done-btn"),
      cleanupModalUsageLabel: document.getElementById("cleanup-modal-usage-label"),
      cleanupModalMeterFill: document.getElementById("cleanup-modal-meter-fill"),
      cleanupEventAgeSelect: document.getElementById("cleanup-event-age-select"),
      btnExecuteCleanupEvents: document.getElementById("btn-execute-cleanup-events"),
      cleanupPreviewEvents: document.getElementById("cleanup-preview-events"),
      cleanupStripPreview: document.getElementById("cleanup-strip-preview"),
      btnExecuteStripImages: document.getElementById("btn-execute-strip-images"),
      cleanupSocialPreview: document.getElementById("cleanup-social-preview"),
      btnExecuteCleanupSocial: document.getElementById("btn-execute-cleanup-social")
    };
  }

  bindEvents() {
    // =========================================================================
    // 1. GLOBAL DELEGATED EVENT HANDLERS (Theme, Language, Demo Accounts)
    // =========================================================================
    document.addEventListener("click", (e) => {
      // Theme toggles
      const themeBtn = e.target.closest("[data-theme-toggle]");
      if (themeBtn) {
        e.preventDefault();
        this.toggleTheme();
        return;
      }

      // Language switcher
      const langBtn = e.target.closest(".lang-btn");
      if (langBtn) {
        e.preventDefault();
        const targetLang = langBtn.dataset.lang;
        if (targetLang && targetLang !== this.currentLang) {
          this.setLanguage(targetLang);
        }
        return;
      }

      // Direct Login 1-Click Demo accounts (Isolated Read-Only Previews)
      const directDemoChip = e.target.closest(".direct-demo-chip");
      if (directDemoChip) {
        e.preventDefault();
        const DEMO_ACCOUNTS = {
          demo: "demo123",
          demo_admin: "demo123"
        };
        const u = directDemoChip.dataset.user;
        if (this.dom.directLoginUsername) this.dom.directLoginUsername.value = u;
        if (this.dom.directLoginPassword) this.dom.directLoginPassword.value = DEMO_ACCOUNTS[u] || "";
        if (this.dom.directLoginForm) this.dom.directLoginForm.requestSubmit();
        return;
      }

      // Modal Login 1-Click Demo accounts (Isolated Read-Only Previews)
      const modalDemoChip = e.target.closest(".btn-demo-chip:not(.direct-demo-chip)");
      if (modalDemoChip) {
        e.preventDefault();
        const DEMO_ACCOUNTS = {
          demo: "demo123",
          demo_admin: "demo123"
        };
        const u = modalDemoChip.dataset.user;
        if (this.dom.loginUsername) this.dom.loginUsername.value = u;
        if (this.dom.loginPassword) this.dom.loginPassword.value = DEMO_ACCOUNTS[u] || "";
        if (this.dom.loginForm) this.dom.loginForm.requestSubmit();
        return;
      }

      // Quick copy share link buttons
      const copyBtn = e.target.closest(".btn-quick-copy-share, .btn-feed-copy-share");
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const link = copyBtn.dataset.link;
        if (link) {
          this.copyToClipboard(link, copyBtn);
        }
        return;
      }

      // Feed open share link buttons
      const openBtn = e.target.closest(".btn-feed-open-share");
      if (openBtn) {
        e.stopPropagation();
        return;
      }
    });

    // =========================================================================
    // 2. AUTHENTICATION & LOGIN FORM HANDLERS
    // =========================================================================
    if (this.dom.directLoginForm) {
      this.dom.directLoginForm.addEventListener("submit", (e) => this.handleDirectLoginSubmit(e));
    }

    if (this.dom.closeLoginDialogBtn) {
      this.dom.closeLoginDialogBtn.addEventListener("click", () => this.dom.loginDialog?.close());
    }
    if (this.dom.cancelLoginBtn) {
      this.dom.cancelLoginBtn.addEventListener("click", () => this.dom.loginDialog?.close());
    }
    if (this.dom.loginForm) {
      this.dom.loginForm.addEventListener("submit", (e) => this.handleLoginSubmit(e));
    }

    // =========================================================================
    // 3. SOCIAL MEDIA CALENDAR HANDLERS
    // =========================================================================
    this.dom.prevMonthBtn?.addEventListener("click", () => this.changeMonth(-1));
    this.dom.nextMonthBtn?.addEventListener("click", () => this.changeMonth(1));
    this.dom.todayBtn?.addEventListener("click", () => {
      const today = new Date();
      this.currentYear = today.getFullYear();
      this.currentMonth = today.getMonth();
      this.render();
    });

    this.dom.viewMonthBtn?.addEventListener("click", () => this.setViewMode("calendar"));
    this.dom.viewYearBtn?.addEventListener("click", () => this.setViewMode("year"));
    this.dom.viewFeedBtn?.addEventListener("click", () => this.setViewMode("feed"));

    this.dom.socialSearchInput?.addEventListener("input", (e) => {
      this.socialSearchQuery = (e.target.value || "").trim().toLowerCase();
      this.render();
    });

    this.dom.openAddPostBtn?.addEventListener("click", () => this.openAddPostModal());
    this.dom.openControlPanelBtn?.addEventListener("click", () => this.openControlPanelModal());

    this.dom.closePostDialogBtn?.addEventListener("click", () => this.dom.postDialog?.close());
    this.dom.cancelPostDialogBtn?.addEventListener("click", () => this.dom.postDialog?.close());
    this.dom.postPlatformSelect?.addEventListener("change", () => this.onPlatformSelectChanged());
    this.dom.postTypeSelect?.addEventListener("change", () => this.updateLiveSpecHelper());
    this.dom.postDescInput?.addEventListener("input", () => this.updateCaptionCounter());
    this.dom.postForm?.addEventListener("submit", (e) => this.handlePostFormSubmit(e));

    this.dom.mediaDropZone?.addEventListener("click", () => this.dom.mediaFileInput?.click());
    this.dom.mediaFileInput?.addEventListener("change", (e) => this.handleFileSelect(e));
    this.dom.applyUrlBtn?.addEventListener("click", () => this.handleUrlApply());

    if (this.dom.mediaDropZone) {
      this.dom.mediaDropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        this.dom.mediaDropZone.style.borderColor = "var(--primary)";
      });
      this.dom.mediaDropZone.addEventListener("dragleave", () => {
        this.dom.mediaDropZone.style.borderColor = "";
      });
      this.dom.mediaDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        this.dom.mediaDropZone.style.borderColor = "";
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.processUploadedFiles(e.dataTransfer.files);
        }
      });
    }

    this.dom.closeDetailDialogBtn?.addEventListener("click", () => this.dom.detailDialog?.close());
    this.dom.detailDeleteBtn?.addEventListener("click", () => this.deleteCurrentDetailPost());
    this.dom.detailDuplicateBtn?.addEventListener("click", () => this.duplicateCurrentDetailPost());
    this.dom.detailEditBtn?.addEventListener("click", () => {
      const postId = this.currentDetailPostId;
      this.dom.detailDialog?.close();
      this.openEditPostModal(postId);
    });

    if (this.dom.btnTestShareLink) {
      this.dom.btnTestShareLink.addEventListener("click", () => {
        const val = this.dom.postShareLink ? this.dom.postShareLink.value.trim() : "";
        if (!val) {
          alert(this.t("alert_share_link_required"));
          return;
        }
        this.openShareLink(val);
      });
    }

    if (this.dom.btnDetailCopyShare) {
      this.dom.btnDetailCopyShare.addEventListener("click", () => {
        const post = this.posts.find(p => p.id === this.currentDetailPostId);
        if (post && post.shareLink) {
          this.copyToClipboard(post.shareLink, this.dom.btnDetailCopyShare);
        }
      });
    }

    if (this.dom.btnCpHeaderAddPlatform) {
      this.dom.btnCpHeaderAddPlatform.addEventListener("click", () => {
        const details = this.dom.cpAddPlatformDetails || document.getElementById("cp-add-platform-details");
        if (details) {
          details.open = !details.open;
          if (details.open) {
            const input = document.getElementById("new-platform-name");
            if (input) input.focus();
            details.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      });
    }
    this.dom.closeCpDialogBtn?.addEventListener("click", () => this.dom.controlPanelDialog?.close());
    this.dom.closeCpDoneBtn?.addEventListener("click", () => this.dom.controlPanelDialog?.close());
    this.dom.addPlatformForm?.addEventListener("submit", (e) => this.handleAddPlatform(e));
    this.dom.cpResetDefaultsBtn?.addEventListener("click", () => this.resetAllDefaults());
    this.dom.cpExportBtn?.addEventListener("click", () => this.exportData());
    this.dom.cpImportBtn?.addEventListener("click", () => this.dom.cpImportFileInput?.click());
    this.dom.cpImportFileInput?.addEventListener("change", (e) => this.importData(e));

    this.dom.closeStandardsDialogBtn?.addEventListener("click", () => this.dom.standardsDialog?.close());
    this.dom.closeStandardsDoneBtn?.addEventListener("click", () => this.dom.standardsDialog?.close());

    // =========================================================================
    // 4. TOP UNIVERSAL NAVIGATION BAR
    // =========================================================================
    if (this.dom.navEventsBtn) {
      this.dom.navEventsBtn.addEventListener("click", () => {
        this.eventsLayoutMode = "panel";
        this.setAppView("events");
      });
    }
    if (this.dom.navScheduleBtn) {
      this.dom.navScheduleBtn.addEventListener("click", () => {
        this.eventsLayoutMode = "schedule";
        this.setAppView("events");
        this.openScheduleEventPage();
      });
    }
    if (this.dom.navMyEventsBtn) {
      this.dom.navMyEventsBtn.addEventListener("click", () => {
        this.eventsLayoutMode = "my-events";
        this.setAppView("events");
      });
    }
    if (this.dom.btnMyEventsCreateNew) {
      this.dom.btnMyEventsCreateNew.addEventListener("click", () => {
        this.eventsLayoutMode = "schedule";
        this.setAppView("events");
        this.openScheduleEventPage();
      });
    }
    if (this.dom.myEventsFilterTabs) {
      this.dom.myEventsFilterTabs.querySelectorAll(".btn-filter-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          this.dom.myEventsFilterTabs.querySelectorAll(".btn-filter-tab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          this.myEventsActiveFilter = btn.dataset.filter || "all";
          this.renderMyEventsPage();
        });
      });
    }
    if (this.dom.myEventsSearchInput) {
      this.dom.myEventsSearchInput.addEventListener("input", () => {
        this.renderMyEventsPage();
      });
    }
    if (this.dom.navSocialBtn) {
      this.dom.navSocialBtn.addEventListener("click", () => {
        if (this.currentUser && this.currentUser.role === "admin") {
          this.setAppView("social");
        }
      });
    }
    if (this.dom.navAdminBtn) {
      this.dom.navAdminBtn.addEventListener("click", () => {
        if (this.currentUser && this.currentUser.role === "admin") {
          this.setAppView("admin");
        }
      });
    }
    if (this.dom.navLogoutBtn) {
      this.dom.navLogoutBtn.addEventListener("click", () => this.handleLogout());
    }

    if (this.dom.linkFooterStandards) {
      this.dom.linkFooterStandards.addEventListener("click", (e) => {
        e.preventDefault();
        this.openStandardsModal();
      });
    }

    // =========================================================================
    // 5. USER EDIT & STORAGE CLEANUP DIALOGS
    // =========================================================================
    this.dom.closeEditUserBtn?.addEventListener("click", () => this.dom.editUserDialog?.close());
    this.dom.cancelEditUserBtn?.addEventListener("click", () => this.dom.editUserDialog?.close());
    this.dom.editUserForm?.addEventListener("submit", (e) => this.handleEditUserSubmit(e));

    this.dom.btnQuotaBannerCleanup?.addEventListener("click", () => this.openStorageCleanupModal());
    this.dom.btnOpenStorageCleanup?.addEventListener("click", () => this.openStorageCleanupModal());
    this.dom.closeStorageCleanupBtn?.addEventListener("click", () => this.dom.storageCleanupDialog?.close());
    this.dom.closeStorageCleanupDoneBtn?.addEventListener("click", () => this.dom.storageCleanupDialog?.close());
    this.dom.cleanupEventAgeSelect?.addEventListener("change", () => this.updateCleanupModalPreviews());
    this.dom.btnExecuteCleanupEvents?.addEventListener("click", () => this.executeCleanupPastEvents());
    this.dom.btnExecuteStripImages?.addEventListener("click", () => this.executeStripPastImages());
    this.dom.btnExecuteCleanupSocial?.addEventListener("click", () => this.executeCleanupSocialMedia());

    this.dom.btnSimNormal?.addEventListener("click", () => {
      this.saveSimulatedStorage(0.15);
      this.updateStorageQuotaDisplay();
    });
    this.dom.btnSimWarning?.addEventListener("click", () => {
      this.saveSimulatedStorage(0.84);
      this.updateStorageQuotaDisplay();
    });
    this.dom.btnSimCritical?.addEventListener("click", () => {
      this.saveSimulatedStorage(0.94);
      this.updateStorageQuotaDisplay();
    });
    this.dom.btnSimReset?.addEventListener("click", () => {
      this.saveSimulatedStorage(null);
      this.updateStorageQuotaDisplay();
    });

    // =========================================================================
    // 6. TEAM EVENTS CALENDAR & DROP-IN SCHEDULER
    // =========================================================================
    this.dom.eventsPrevMonthBtn?.addEventListener("click", () => this.changeEventsPeriod(-1));
    this.dom.eventsNextMonthBtn?.addEventListener("click", () => this.changeEventsPeriod(1));
    this.dom.eventsTodayBtn?.addEventListener("click", () => this.jumpToEventsToday());

    this.dom.btnZoomOut?.addEventListener("click", () => this.stepZoom(-1));
    this.dom.btnZoomIn?.addEventListener("click", () => this.stepZoom(1));
    this.dom.btnZoomDaily?.addEventListener("click", () => this.setEventsZoomLevel("daily"));
    this.dom.btnZoomMonthly?.addEventListener("click", () => this.setEventsZoomLevel("monthly"));
    this.dom.btnZoomYearly?.addEventListener("click", () => this.setEventsZoomLevel("yearly"));
    this.dom.openAddEventBtn?.addEventListener("click", () => this.openAddEventModal());

    // Entry Type Switcher buttons
    this.dom.btnEntryTypeEvent?.addEventListener("click", () => this.setEventEntryType("event"));
    this.dom.btnEntryTypeLocked?.addEventListener("click", () => this.setEventEntryType("locked"));
    this.dom.btnEntryTypeRoom?.addEventListener("click", () => this.setEventEntryType("room_only"));

    // Accommodation / Sleeping Room Booking Category listeners
    this.dom.eventNeedsRoom?.addEventListener("change", (e) => this.handleToggleNeedsRoom(e.target.checked));
    this.dom.btnAddRoomBooking?.addEventListener("click", () => this.handleAddRoomBookingRow());

    this.dom.closeEventDialogBtn?.addEventListener("click", () => this.closeEventForm());
    this.dom.wizardPrevBtn?.addEventListener("click", () => this.prevWizardStep());
    this.dom.wizardNextBtn?.addEventListener("click", () => this.nextWizardStep());
    this.dom.eventForm?.addEventListener("submit", (e) => this.handleEventFormSubmit(e));
    this.dom.eventTimingModeInputs?.forEach(input => input.addEventListener("change", event => {
      this.setEventTimingMode(event.target.value);
    }));

    if (this.dom.eventDateInput) {
      this.dom.eventDateInput.addEventListener("change", (e) => {
        const val = e.target.value;
        this.updateFreeHoursBoard(val);
        this.checkEventDateConflict(val, val, this.dom.eventEditId?.value);
        this.findSmartSuggestions(val, this.dom.eventHourInput?.value, this.dom.eventDurationInput?.value, this.dom.eventEditId?.value);
      });
    }

    this.dom.eventHourInput?.addEventListener("change", () => {
      const d = this.dom.eventDateInput?.value;
      this.checkEventDateConflict(d, d, this.dom.eventEditId?.value);
      this.findSmartSuggestions(d, this.dom.eventHourInput.value, this.dom.eventDurationInput?.value, this.dom.eventEditId?.value);
    });

    this.dom.eventDurationInput?.addEventListener("input", () => {
      this.updateFreeHoursBoard(this.dom.eventDateInput?.value);
      this.checkEventDateConflict(this.dom.eventDateInput?.value, this.dom.eventDateInput?.value, this.dom.eventEditId?.value);
      this.findSmartSuggestions(this.dom.eventDateInput?.value, this.dom.eventHourInput?.value, this.dom.eventDurationInput.value, this.dom.eventEditId?.value);
    });

    if (this.dom.eventIsRecurrent) {
      this.dom.eventIsRecurrent.addEventListener("change", (e) => {
        if (this.dom.eventRecurrenceOptions) {
          this.dom.eventRecurrenceOptions.style.display = e.target.checked ? "block" : "none";
        }
        this.updateRecurrencePreviewHint("modal");
      });
    }
    this.dom.eventRecurrenceMonths?.addEventListener("change", () => this.updateRecurrencePreviewHint("modal"));

    if (this.dom.eventFbImageFile) {
      this.dom.eventFbImageFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => this.validateFacebookImage(evt.target.result);
          reader.readAsDataURL(file);
        }
      });
    }

    if (this.dom.eventFbImageUrl) {
      this.dom.eventFbImageUrl.addEventListener("input", () => {
        const url = this.dom.eventFbImageUrl.value.trim();
        if (url) {
          this.validateFacebookImage(url);
        } else if (!this.dom.eventFbImageData?.value) {
          this.resetFacebookValidation();
        }
      });
    }

    this.dom.btnUseFbSample?.addEventListener("click", () => {
      const sample16by9 = "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&h=675&q=80";
      if (this.dom.eventFbImageUrl) this.dom.eventFbImageUrl.value = sample16by9;
      this.validateFacebookImage(sample16by9);
    });

    this.dom.closeEventDetailBtn?.addEventListener("click", () => this.dom.eventDetailDialog?.close());
    this.dom.closeEventDetailDoneBtn?.addEventListener("click", () => this.dom.eventDetailDialog?.close());
    this.dom.eventDetailDeleteBtn?.addEventListener("click", () => this.deleteCurrentDetailEvent());
    this.dom.eventDetailEditBtn?.addEventListener("click", () => {
      const id = this.currentDetailEventId;
      this.dom.eventDetailDialog?.close();
      this.openEditEventModal(id);
    });

    this.dom.createUserForm?.addEventListener("submit", (e) => this.handleCreateUser(e));
    this.dom.createSpaceForm?.addEventListener("submit", (e) => this.handleCreateSpace(e));
    this.dom.createRoomForm?.addEventListener("submit", (e) => this.handleCreateRoom(e));

    this.dom.adminCatTabs?.forEach(tab => {
      tab.addEventListener("click", () => {
        const cat = tab.dataset.adminCat || "all";
        this.setAdminCategory(cat);
      });
    });

    this.dom.btnSocialEventNotifications?.addEventListener("click", () => this.openSocialNotificationsModal());
    this.dom.closeSocialNotificationsBtn?.addEventListener("click", () => this.dom.socialNotificationsModal?.close());
    this.dom.closeSocialNotificationsDoneBtn?.addEventListener("click", () => this.dom.socialNotificationsModal?.close());

    document.querySelectorAll(".notif-filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".notif-filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.notifFilter = pill.dataset.notifFilter || "all";
        this.renderSocialNotifications();
      });
    });
  }

  // Helpers
  getPlatform(id) {
    return this.platforms.find(p => p.id === id);
  }

  getPlatformIcon(platform) {
    if (!platform) return "assets/icons/default.png";
    if (platform.iconUrl) return platform.iconUrl;
    if (platform.domain) return `https://www.google.com/s2/favicons?domain=${platform.domain}&sz=64`;
    return `assets/icons/${platform.id}.png`;
  }

  getPostType(platformId, postTypeId) {
    const platform = this.getPlatform(platformId);
    if (!platform) return null;
    return platform.postTypes.find(pt => pt.id === postTypeId) || platform.postTypes[0];
  }

  changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.render();
  }

  setViewMode(mode) {
    this.viewMode = ["calendar", "year", "feed"].includes(mode) ? mode : "year";
    this.syncSocialViewMode();
    this.savePrefs();
    this.render();
  }

  syncSocialViewMode() {
    const mode = ["calendar", "year", "feed"].includes(this.viewMode) ? this.viewMode : "year";
    this.viewMode = mode;
    this.dom.viewYearBtn?.classList.toggle("active", mode === "year");
    this.dom.viewMonthBtn.classList.toggle("active", mode === "calendar");
    this.dom.viewFeedBtn.classList.toggle("active", mode === "feed");
    this.dom.calendarView.style.display = mode === "calendar" ? "flex" : "none";
    this.dom.feedView.style.display = mode === "feed" ? "flex" : "none";
    if (this.dom.socialYearView) this.dom.socialYearView.style.display = mode === "year" ? "block" : "none";
  }

  // Filter posts based on month, year, platform, and "Show Only What We Have"
  getFilteredPosts() {
    return this.posts.filter(post => {
      if (!post.date) return false;
      const [year, month] = post.date.split("-").map(Number);
      const isCurrentMonth = year === this.currentYear && month === (this.currentMonth + 1);
      if (!isCurrentMonth) return false;

      // Platform enabled check: hide posts for disabled platforms
      const platform = this.getPlatform(post.platformId);
      if (platform && platform.enabled === false) return false;

      if (this.selectedPlatformId !== "all" && post.platformId !== this.selectedPlatformId) {
        return false;
      }

      // Search query filter (matches title, copy/caption, format/type, or platform name)
      if (this.socialSearchQuery) {
        const q = this.socialSearchQuery;
        const postTitle = (post.title || "").toLowerCase();
        const postCopy = (post.copy || post.caption || post.content || "").toLowerCase();
        const postType = (post.postType || "").toLowerCase();
        const platName = (platform ? platform.name : "").toLowerCase();
        const matchesQuery = postTitle.includes(q) || postCopy.includes(q) || postType.includes(q) || platName.includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }

  // Main Render Routine
  render() {
    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;

    const currentMonthTitle = `${monthNames[this.currentMonth]} ${this.currentYear}`;
    this.dom.currentMonthLabel.textContent = currentMonthTitle;
    this.dom.bannerMonthName.textContent = currentMonthTitle;

    // Render Platform Filter Bar (resets selectedPlatformId to 'all' if active platform was disabled)
    this.renderPlatformFilterBar();

    // Render Status Banner stats
    const filteredPosts = this.getFilteredPosts();
    const activePlatform = this.getPlatform(this.selectedPlatformId);
    const activePlatformName = (this.selectedPlatformId === "all" || !activePlatform || activePlatform.enabled === false)
      ? this.t("social_all_platforms")
      : activePlatform.name;
    this.dom.bannerActivePlatform.textContent = activePlatformName;
    this.dom.bannerPostCount.textContent = filteredPosts.length;

    // Render Active View
    if (this.viewMode === "calendar") {
      this.renderCalendarGrid(filteredPosts);
    } else if (this.viewMode === "feed") {
      this.renderFeedView(filteredPosts);
    } else {
      this.renderSocialYearView();
    }

    // Refresh Social Notification Badge
    this.updateSocialNotificationBadge();
  }

  // Platform Filter Bar with Live Counters & "Show only what we have"
  renderPlatformFilterBar() {
    if (!this.dom.platformFilterBar) return;
    this.dom.platformFilterBar.innerHTML = "";

    // If currently selected platform is disabled, reset to "all"
    if (this.selectedPlatformId !== "all") {
      const currentSelected = this.getPlatform(this.selectedPlatformId);
      if (!currentSelected || currentSelected.enabled === false) {
        this.selectedPlatformId = "all";
        this.savePrefs();
      }
    }

    const enabledPlatforms = this.platforms.filter(p => p.enabled !== false);

    // Count posts in current month per platform (only for enabled platforms)
    const platformPostCounts = {};
    let totalMonthPosts = 0;

    enabledPlatforms.forEach(p => { platformPostCounts[p.id] = 0; });

    this.posts.forEach(post => {
      if (!post.date) return;
      const [year, month] = post.date.split("-").map(Number);
      if (year === this.currentYear && month === (this.currentMonth + 1)) {
        if (platformPostCounts[post.platformId] !== undefined) {
          totalMonthPosts++;
          platformPostCounts[post.platformId]++;
        }
      }
    });

    // "All Platforms" Tab
    const allTab = document.createElement("button");
    allTab.type = "button";
    allTab.className = `btn-filter-tab ${this.selectedPlatformId === "all" ? "active" : ""}`;
    allTab.innerHTML = `
      <span>${this.t("social_all_platforms")}</span>
      <span class="filter-tab-badge">${totalMonthPosts}</span>
    `;
    allTab.addEventListener("click", () => {
      this.selectedPlatformId = "all";
      this.savePrefs();
      this.render();
    });
    this.dom.platformFilterBar.appendChild(allTab);

    // Platform Filter Tabs (Enabled platforms only)
    enabledPlatforms.forEach(platform => {
      const count = platformPostCounts[platform.id] || 0;

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `btn-filter-tab ${this.selectedPlatformId === platform.id ? "active" : ""}`;
      tab.dataset.platform = platform.id;
      const iconSrc = this.getPlatformIcon(platform);
      tab.innerHTML = `
        <img class="platform-favicon" src="${iconSrc}" alt="${platform.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
        <span class="platform-dot" style="background: ${platform.color}; display: none;"></span>
        <span>${platform.name}</span>
        <span class="filter-tab-badge">${count}</span>
      `;
      tab.addEventListener("click", () => {
        this.selectedPlatformId = platform.id;
        this.savePrefs();
        this.render();
      });
      this.dom.platformFilterBar.appendChild(tab);
    });
  }

  // Calendar Grid Renderer
  renderCalendarGrid(filteredPosts) {
    this.dom.calendarDaysGrid.innerHTML = "";

    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Monday start: 0 = Mon, 6 = Sun
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    // Previous month overflow days
    const prevMonthLastDay = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;

    const today = new Date();
    const isThisCurrentRealMonth = today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth;
    const realTodayDate = today.getDate();

    // Group posts by date
    const postsByDate = {};
    filteredPosts.forEach(post => {
      if (!postsByDate[post.date]) postsByDate[post.date] = [];
      postsByDate[post.date].push(post);
    });

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("div");
      cell.className = "calendar-day-cell";

      let dayNumber;
      let cellDateString = "";
      let isCurrentMonthCell = true;

      if (i < startDayOfWeek) {
        // Prev month day
        dayNumber = prevMonthLastDay - (startDayOfWeek - 1 - i);
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const prevMonth = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
        const prevYear = this.currentMonth === 0 ? this.currentYear - 1 : this.currentYear;
        cellDateString = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else if (i >= startDayOfWeek + daysInMonth) {
        // Next month day
        dayNumber = i - (startDayOfWeek + daysInMonth) + 1;
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const nextMonth = this.currentMonth === 11 ? 0 : this.currentMonth + 1;
        const nextYear = this.currentMonth === 11 ? this.currentYear + 1 : this.currentYear;
        cellDateString = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else {
        // Current month day
        dayNumber = i - startDayOfWeek + 1;
        cellDateString = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
        if (isThisCurrentRealMonth && dayNumber === realTodayDate) {
          cell.classList.add("is-today");
        }
      }

      const isPast = this.isPastEventDate(cellDateString);
      if (isPast) cell.classList.add("is-past");
      if (isPast && isCurrentMonthCell) {
        cell.classList.add("has-past-schedule-message");
        cell.dataset.pastScheduleMessage = this.t("post_past_create_unavailable");
      }

      const dayPosts = postsByDate[cellDateString] || [];

      // Day Header
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.innerHTML = `
        <span class="day-number">${dayNumber}</span>
        ${isCurrentMonthCell && !isPast ? `<button class="btn-add-day" title="Schedule post for this date" data-date="${cellDateString}">+</button>` : ""}
        ${isPast && isCurrentMonthCell ? `<span class="past-schedule-message" aria-live="polite">${this.t("post_past_create_unavailable")}</span>` : ""}
      `;

      cell.appendChild(dayHeader);

      // Add Post click on cell header '+'
      const addBtn = dayHeader.querySelector(".btn-add-day");
      if (addBtn) {
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAddPostModal(cellDateString);
        });
      }

      // Posts Container for this day
      const postsContainer = document.createElement("div");
      postsContainer.className = "day-posts-container";

      dayPosts.forEach(post => {
        const platform = this.getPlatform(post.platformId);
        const iconSrc = this.getPlatformIcon(platform);
        const postCard = document.createElement("div");
        postCard.className = "post-card-pill";
        postCard.style.borderLeftColor = platform ? platform.color : "var(--primary)";

        const mediaIcon = post.mediaType === "video" ? "Video" : (post.mediaCount > 1 ? `Gallery (${post.mediaCount})` : "Photo");

        postCard.innerHTML = `
          <div class="post-card-pill-header">
            <span class="post-card-platform-badge" style="color: ${platform ? platform.color : 'inherit'}">
              <img class="platform-favicon-sm" src="${iconSrc}" alt="" onerror="this.style.display='none'">
              ${platform ? platform.name : post.platformId}
            </span>
            <span class="post-card-time">${post.time || "12:00"}</span>
          </div>
          <div class="post-card-title">${this.escapeHtml(post.title || post.description || "Untitled Post")}</div>
          <div class="post-card-footer">
            <span class="media-tag">${mediaIcon} ${post.mediaType}</span>
            ${post.shareLink ? `<button type="button" class="share-pill-btn btn-quick-copy-share" data-link="${this.escapeHtml(post.shareLink)}" title="Copy asset share link: ${this.escapeHtml(post.shareLink)}">Copy share link</button>` : `<span class="aspect-tag">${post.aspectRatio || "9:16"}</span>`}
          </div>
        `;

        postCard.addEventListener("click", () => {
          this.openPostDetailModal(post.id);
        });

        postsContainer.appendChild(postCard);
      });

      cell.appendChild(postsContainer);
      this.dom.calendarDaysGrid.appendChild(cell);
    }
  }

  renderSocialYearView() {
    if (!this.dom.socialYearMonthsGrid) return;
    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;
    const weekdaysMin = this.currentLang === "ro" ? ["L", "M", "M", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];
    const todayStr = this.getTodayDateString();
    const today = new Date();
    this.dom.socialYearMonthsGrid.innerHTML = "";

    for (let month = 0; month < 12; month++) {
      const monthPosts = this.posts.filter(post => {
        if (!post.date) return false;
        const [year, postMonth] = post.date.split("-").map(Number);
        const platform = this.getPlatform(post.platformId);
        return year === this.currentYear
          && postMonth === month + 1
          && platform?.enabled !== false
          && (this.selectedPlatformId === "all" || post.platformId === this.selectedPlatformId);
      });
      const card = document.createElement("div");
      const isPastMonth = this.currentYear < today.getFullYear()
        || (this.currentYear === today.getFullYear() && month < today.getMonth());
      card.className = `yearly-month-card ${month === this.currentMonth ? "current-month-card" : ""} ${isPastMonth ? "is-past-month" : ""}`;
      const countBadge = monthPosts.length > 0
        ? `<span class="yearly-month-events-badge has-events">${monthPosts.length} ${this.t(monthPosts.length === 1 ? "social_year_posts_singular" : "social_year_posts_plural")}</span>`
        : `<span class="yearly-month-events-badge">0 ${this.t("social_year_posts_plural")}</span>`;
      card.innerHTML = `
        <div class="yearly-month-header">
          <div class="yearly-month-title"><svg class="ui-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg> ${monthNames[month]}</div>
          ${countBadge}
        </div>
        <div class="yearly-mini-calendar">
          <div class="yearly-mini-weekday">${weekdaysMin[0]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[1]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[2]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[3]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[4]}</div>
          <div class="yearly-mini-weekday" style="color: #64748b;">${weekdaysMin[5]}</div>
          <div class="yearly-mini-weekday" style="color: #64748b;">${weekdaysMin[6]}</div>
        </div>
      `;

      const miniCal = card.querySelector(".yearly-mini-calendar");
      const firstDay = new Date(this.currentYear, month, 1);
      const daysInMonth = new Date(this.currentYear, month + 1, 0).getDate();
      let startDayOfWeek = firstDay.getDay() - 1;
      if (startDayOfWeek < 0) startDayOfWeek = 6;

      for (let pad = 0; pad < startDayOfWeek; pad++) {
        const padCell = document.createElement("div");
        padCell.className = "yearly-mini-day other-month";
        miniCal.appendChild(padCell);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${this.currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const datePosts = monthPosts.filter(post => post.date === dateStr);
        const dayCell = document.createElement("div");
        dayCell.className = "yearly-mini-day";
        dayCell.textContent = day;
        dayCell.tabIndex = 0;
        dayCell.setAttribute("role", "button");
        dayCell.setAttribute("aria-label", `${dateStr}${datePosts.length ? `, ${datePosts.length} scheduled post${datePosts.length === 1 ? "" : "s"}` : ""}`);

        if (dateStr < todayStr) dayCell.classList.add("is-past");
        if (dateStr === todayStr) dayCell.classList.add("is-today");
        if (datePosts.length) {
          dayCell.classList.add("has-event-circle");
          dayCell.title = datePosts.map(post => `• ${post.title} (${post.time || "09:00"})`).join("\n");
        }
        const openMonth = event => {
          event.stopPropagation();
          this.currentMonth = month;
          this.setViewMode("calendar");
        };
        dayCell.addEventListener("click", openMonth);
        dayCell.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") openMonth(event);
        });
        miniCal.appendChild(dayCell);
      }

      card.addEventListener("click", () => {
        this.currentMonth = month;
        this.setViewMode("calendar");
      });
      this.dom.socialYearMonthsGrid.appendChild(card);
    }
  }

  // Chronological Feed List View (Show only scheduled items cleanly)
  renderFeedView(filteredPosts) {
    this.dom.feedView.innerHTML = "";

    if (filteredPosts.length === 0) {
      this.dom.feedView.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" aria-hidden="true"></div>
          <h3>No posts scheduled for this selection</h3>
          <p>Click <strong>"+ New Post"</strong> to schedule content for this month.</p>
          <button class="btn btn-primary btn-sm" id="empty-add-btn">+ Schedule New Post</button>
        </div>
      `;
      const btn = document.getElementById("empty-add-btn");
      if (btn) btn.addEventListener("click", () => this.openAddPostModal());
      return;
    }

    // Sort chronologically by date and time
    const sorted = [...filteredPosts].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || "00:00"}`);
      const dateB = new Date(`${b.date}T${b.time || "00:00"}`);
      return dateA - dateB;
    });

    // Group by date
    const grouped = {};
    sorted.forEach(post => {
      if (!grouped[post.date]) grouped[post.date] = [];
      grouped[post.date].push(post);
    });

    Object.keys(grouped).forEach(dateStr => {
      const datePosts = grouped[dateStr];
      const dateObj = new Date(dateStr + "T00:00:00");
      const dateFormatted = dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

      const dayGroup = document.createElement("div");
      dayGroup.className = "feed-day-group";

      dayGroup.innerHTML = `
        <div class="feed-day-header">
          <div class="feed-day-title">
            <span class="day-date-tag">${dateFormatted}</span>
            <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">(${datePosts.length} ${datePosts.length === 1 ? 'post' : 'posts'})</span>
          </div>
          <button class="btn btn-secondary btn-sm btn-feed-add" data-date="${dateStr}">+ Add Post</button>
        </div>
        <div class="feed-posts-grid"></div>
      `;

      dayGroup.querySelector(".btn-feed-add").addEventListener("click", () => {
        this.openAddPostModal(dateStr);
      });

      const grid = dayGroup.querySelector(".feed-posts-grid");

      datePosts.forEach(post => {
        const platform = this.getPlatform(post.platformId);
        const postType = this.getPostType(post.platformId, post.postTypeId);

        const card = document.createElement("div");
        card.className = "feed-post-card";

        const mediaIcon = post.mediaType === "video" ? "Video" : (post.mediaCount > 1 ? `Gallery (${post.mediaCount})` : "Photo");

        const iconSrc = this.getPlatformIcon(platform);
        const fallbackImg = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";

        card.innerHTML = `
          <div class="feed-post-media-preview">
            <img src="${post.mediaUrl || fallbackImg}" alt="Preview" loading="lazy">
            <span class="feed-media-badge">${mediaIcon}</span>
            <span class="feed-aspect-badge">${post.aspectRatio || "9:16"}</span>
          </div>
          <div class="feed-post-content">
            <div class="feed-post-platform-row">
              <span class="feed-platform-tag" style="color: ${platform ? platform.color : 'inherit'}">
                <img class="platform-favicon" src="${iconSrc}" alt="" onerror="this.style.display='none'">
                ${platform ? platform.name : post.platformId}
              </span>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${post.time || "12:00"}</span>
            </div>
            <h4 class="feed-post-title">${this.escapeHtml(post.title || "Untitled")}</h4>
            ${post.description ? `<p class="feed-post-desc">${this.escapeHtml(post.description)}</p>` : ""}
            <div class="feed-post-footer">
              <span>Standard: <strong>${postType ? postType.recommendedWidth + "x" + postType.recommendedHeight : "Standard"}</strong></span>
              <span style="text-transform: capitalize; color: ${post.status === 'published' ? '#10b981' : '#60a5fa'}; font-weight: 600;">
                ● ${post.status || 'Scheduled'}
              </span>
            </div>
            ${post.shareLink ? `
              <div class="feed-share-row">
                <span style="font-size: 0.74rem; color: #38bdf8; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
                  Asset share link: <span style="color: var(--text-primary); font-family: monospace; font-size: 0.72rem; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(post.shareLink)}</span>
                </span>
                <div style="display: inline-flex; gap: 6px;">
                  <button type="button" class="btn btn-secondary btn-sm btn-feed-copy-share" data-link="${this.escapeHtml(post.shareLink)}" style="font-size: 0.72rem; padding: 3px 8px; font-weight: 700;">${this.t("post_detail_copy_share_btn")}</button>
                  <a href="${post.shareLink.startsWith('http') ? this.escapeHtml(post.shareLink) : '#'}" target="_blank" class="btn btn-primary btn-sm btn-feed-open-share" data-link="${this.escapeHtml(post.shareLink)}" style="font-size: 0.72rem; padding: 3px 8px; text-decoration: none; font-weight: 700;">Open Share <svg class="ui-icon" style="width:11px;height:11px;vertical-align:middle"><use href="#icon-external-link"></use></svg></a>
                </div>
              </div>
            ` : ""}
          </div>
        `;

        card.addEventListener("click", () => {
          this.openPostDetailModal(post.id);
        });

        grid.appendChild(card);
      });

      this.dom.feedView.appendChild(dayGroup);
    });
  }

  // Post Creator / Editor Dialog Handling
  openAddPostModal(preselectedDate = null, prefillData = null) {
    const requestedDate = prefillData?.date || preselectedDate;
    if (requestedDate && this.isPastEventDate(requestedDate)) {
      alert(this.t("post_past_create_unavailable"));
      return;
    }
    const enabledPlatforms = this.platforms.filter(p => p.enabled !== false);
    if (enabledPlatforms.length === 0) {
      alert(this.t("alert_platforms_disabled"));
      return;
    }

    this.dom.postEditId.value = "";
    this.dom.postDialogActionText.textContent = prefillData ? "Promote event on social" : "Schedule new post";
    this.dom.postForm.reset();

    // Track if this post is linked to an event promotion
    this.eventPendingPromotionId = prefillData && prefillData.eventId ? prefillData.eventId : null;

    // Populate Platform Dropdown
    this.populatePlatformSelect();

    // If prefill requests a specific platform or default to facebook, apply it
    if (prefillData && prefillData.platformId) {
      this.dom.postPlatformSelect.value = prefillData.platformId;
    } else if (prefillData && this.getPlatform("facebook") && this.getPlatform("facebook").enabled !== false) {
      this.dom.postPlatformSelect.value = "facebook";
    } else if (this.selectedPlatformId !== "all") {
      const currentSelected = this.getPlatform(this.selectedPlatformId);
      if (currentSelected && currentSelected.enabled !== false) {
        this.dom.postPlatformSelect.value = this.selectedPlatformId;
      }
    }

    this.onPlatformSelectChanged();

    // Date & Time
    if (prefillData && prefillData.date) {
      this.dom.postDateInput.value = prefillData.date;
      this.dom.postTimeInput.value = prefillData.time || "12:00";
    } else if (preselectedDate) {
      this.dom.postDateInput.value = preselectedDate;
    } else {
      const preferredDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, "0")}-15`;
      const defaultDate = this.isPastEventDate(preferredDate) ? this.getTodayDateString() : preferredDate;
      this.dom.postDateInput.value = defaultDate;
    }

    // Prefill Title, Description & Media
    if (prefillData) {
      if (prefillData.title) this.dom.postTitleInput.value = prefillData.title;
      if (prefillData.description) this.dom.postDescInput.value = prefillData.description;
      if (prefillData.status) this.dom.postStatusSelect.value = prefillData.status;

      if (prefillData.mediaUrl) {
        this.setPostMedia({
          type: "photo",
          url: prefillData.mediaUrl,
          name: "event-cover-16x9.jpg",
          aspectRatio: "16:9",
          count: 1
        });
      } else {
        this.clearPostMedia();
      }
    } else {
      this.clearPostMedia();
    }

    if (this.dom.postShareLink) {
      this.dom.postShareLink.value = (prefillData && prefillData.shareLink) ? prefillData.shareLink : "";
    }

    this.updateLiveSpecHelper();
    this.updateCaptionCounter();
    this.dom.postDialog.showModal();
  }

  clearPostMedia() {
    this.currentPostMedia = null;
    this.dom.previewImg.style.display = "none";
    this.dom.previewImg.src = "";
    this.dom.previewVideo.style.display = "none";
    this.dom.previewVideo.src = "";
    this.dom.previewMediaName.textContent = "No media selected";
    this.dom.previewAspectPill.textContent = "Awaiting upload";
  }

  openEditPostModal(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    this.dom.postEditId.value = post.id;
    this.dom.postDialogActionText.textContent = "Edit Scheduled Post";
    this.populatePlatformSelect(post.platformId);

    this.dom.postPlatformSelect.value = post.platformId;
    this.onPlatformSelectChanged();

    this.dom.postTypeSelect.value = post.postTypeId;
    this.updateLiveSpecHelper();

    this.dom.postDateInput.value = post.date;
    this.dom.postTimeInput.value = post.time || "12:00";
    this.dom.postTitleInput.value = post.title || "";
    this.dom.postDescInput.value = post.description || "";
    this.dom.postStatusSelect.value = post.status || "scheduled";
    if (this.dom.postShareLink) {
      this.dom.postShareLink.value = post.shareLink || "";
    }

    // Media
    this.setPostMedia({
      type: post.mediaType,
      url: post.mediaUrl,
      name: (post.mediaNames && post.mediaNames[0]) || "media-file",
      aspectRatio: post.aspectRatio || "9:16",
      count: post.mediaCount || 1
    });

    this.updateCaptionCounter();
    this.dom.postDialog.showModal();
  }

  populatePlatformSelect(includePlatformId = null) {
    this.dom.postPlatformSelect.innerHTML = "";
    const platformsToShow = this.platforms.filter(p => p.enabled !== false || p.id === includePlatformId);
    platformsToShow.forEach(platform => {
      const opt = document.createElement("option");
      opt.value = platform.id;
      opt.textContent = platform.name + (platform.enabled === false ? ` (${this.t("cp_status_disabled")})` : "");
      this.dom.postPlatformSelect.appendChild(opt);
    });
  }

  onPlatformSelectChanged() {
    const platformId = this.dom.postPlatformSelect.value;
    const platform = this.getPlatform(platformId);
    this.dom.postTypeSelect.innerHTML = "";

    if (platform && platform.postTypes) {
      platform.postTypes.forEach(pt => {
        const opt = document.createElement("option");
        opt.value = pt.id;
        opt.textContent = `${pt.name} (${pt.recommendedWidth}×${pt.recommendedHeight} - ${pt.aspectRatio})`;
        this.dom.postTypeSelect.appendChild(opt);
      });
    }

    this.updateLiveSpecHelper();
    this.updateCaptionCounter();
  }

  updateLiveSpecHelper() {
    const platformId = this.dom.postPlatformSelect.value;
    const postTypeId = this.dom.postTypeSelect.value;
    const postType = this.getPostType(platformId, postTypeId);

    if (!postType) {
      this.dom.liveSpecHelper.innerHTML = `<span style="color: var(--text-muted)">Select a post type to see 2026 specs.</span>`;
      return;
    }

    // Update collapsible summary headers
    if (this.dom.specSummaryTitle) {
      this.dom.specSummaryTitle.textContent = `Standard requirements: ${postType.name}`;
    }
    if (this.dom.specSummaryBadge) {
      this.dom.specSummaryBadge.textContent = `${postType.aspectRatio} • ${postType.recommendedWidth}×${postType.recommendedHeight} px`;
    }

    this.dom.liveSpecHelper.innerHTML = `
      <div class="spec-helper-title">
        <span>2026 standard requirements: ${postType.name}</span>
      </div>
      <div class="spec-helper-grid">
        <div class="spec-helper-item">
          <strong>${postType.aspectRatio}</strong>
          <span>Aspect Ratio</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.recommendedWidth} × ${postType.recommendedHeight} px</strong>
          <span>Optimal Resolution</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.format}</strong>
          <span>Format & Encoding</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.maxDuration || "N/A"}</strong>
          <span>Duration / Count</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.maxFileSize || "Standard"}</strong>
          <span>File Size Limit</span>
        </div>
        <div class="spec-helper-item">
          <strong>${postType.captionLimit || 2200} chars</strong>
          <span>Caption Limit</span>
        </div>
      </div>
      <div class="spec-safe-zone">
        <strong>Safe zone:</strong> ${postType.safeZone || "Keep text centered to avoid UI overlay obstructions."}
      </div>
    `;

    // Update aspect tag in preview if waiting
    if (this.dom.previewAspectPill) {
      this.dom.previewAspectPill.textContent = `Standard: ${postType.aspectRatio}`;
    }
  }

  updateCaptionCounter() {
    const platformId = this.dom.postPlatformSelect.value;
    const postTypeId = this.dom.postTypeSelect.value;
    const postType = this.getPostType(platformId, postTypeId);
    const limit = postType?.captionLimit || 2200;
    const currentLength = this.dom.postDescInput.value.length;

    this.dom.captionCounter.textContent = `${currentLength} / ${limit} chars`;
    if (currentLength > limit) {
      this.dom.captionCounter.style.color = "var(--danger)";
      this.dom.captionCounter.textContent += " (Exceeds platform standard limit!)";
    } else {
      this.dom.captionCounter.style.color = "var(--text-muted)";
    }
  }

  setPostMedia(media) {
    this.currentPostMedia = {
      type: media.type || "photo",
      url: media.url,
      name: media.name || "media-file",
      aspectRatio: media.aspectRatio || media.ratio || "9:16",
      count: media.count || 1
    };

    if (this.currentPostMedia.type === "video") {
      this.dom.previewImg.style.display = "none";
      this.dom.previewVideo.style.display = "block";
      this.dom.previewVideo.src = this.currentPostMedia.url;
    } else {
      this.dom.previewVideo.style.display = "none";
      this.dom.previewImg.style.display = "block";
      this.dom.previewImg.src = this.currentPostMedia.url;
    }

    this.dom.previewMediaName.textContent = `${this.currentPostMedia.name} (${this.currentPostMedia.type === 'video' ? 'Video' : (this.currentPostMedia.count > 1 ? this.currentPostMedia.count + ' photos' : 'Single Photo')})`;
  }

  handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      this.processUploadedFiles(files);
    }
  }

  processUploadedFiles(files) {
    const firstFile = files[0];
    const isVideo = firstFile.type.startsWith("video/");
    const reader = new FileReader();

    reader.onload = (event) => {
      this.setPostMedia({
        type: isVideo ? "video" : (files.length > 1 ? "photos" : "photo"),
        url: event.target.result,
        name: firstFile.name,
        aspectRatio: isVideo ? "9:16" : (files.length > 1 ? "4:5" : "1:1"),
        count: files.length
      });
    };

    reader.readAsDataURL(firstFile);
  }

  handleUrlApply() {
    const url = this.dom.mediaUrlInput.value.trim();
    if (!url) return;
    const isVideo = url.endsWith(".mp4") || url.endsWith(".mov") || url.endsWith(".webm");
    this.setPostMedia({
      type: isVideo ? "video" : "photo",
      url: url,
      name: url.substring(url.lastIndexOf("/") + 1) || "linked-media",
      aspectRatio: isVideo ? "9:16" : "4:5",
      count: 1
    });
    this.dom.mediaUrlInput.value = "";
  }

  handlePostFormSubmit(e) {
    e.preventDefault();

    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save_post"));
      return;
    }

    // If media not set yet, check if URL input has text
    if (!this.currentPostMedia) {
      const urlText = this.dom.mediaUrlInput.value.trim();
      if (urlText) {
        this.handleUrlApply();
      } else {
        alert(this.t("alert_media_required"));
        return;
      }
    }

    const editId = this.dom.postEditId.value;
    if (!editId && this.isPastEventDate(this.dom.postDateInput.value)) {
      alert(this.t("post_past_create_unavailable"));
      return;
    }
    const platformId = this.dom.postPlatformSelect.value;
    const postTypeId = this.dom.postTypeSelect.value;
    const postType = this.getPostType(platformId, postTypeId);

    const postData = {
      id: editId || `post-${Date.now()}`,
      platformId: platformId,
      postTypeId: postTypeId,
      date: this.dom.postDateInput.value,
      time: this.dom.postTimeInput.value || "12:00",
      title: this.dom.postTitleInput.value.trim(),
      description: this.dom.postDescInput.value.trim(),
      status: this.dom.postStatusSelect.value,
      mediaType: this.currentPostMedia.type,
      mediaUrl: this.currentPostMedia.url,
      mediaCount: this.currentPostMedia.count,
      mediaNames: [this.currentPostMedia.name],
      aspectRatio: postType ? postType.aspectRatio : (this.currentPostMedia.aspectRatio || "9:16"),
      shareLink: this.dom.postShareLink ? this.dom.postShareLink.value.trim() : ""
    };

    if (editId) {
      const index = this.posts.findIndex(p => p.id === editId);
      if (index !== -1) {
        this.posts[index] = postData;
      }
    } else {
      this.posts.push(postData);

      // Link event if this post was created via event promotion notification
      if (this.eventPendingPromotionId) {
        const evt = this.events.find(e => e.id === this.eventPendingPromotionId);
        if (evt) {
          evt.socialStatus = "promoted";
          evt.promotedPostId = postData.id;
          evt.promotedAt = new Date().toISOString();
          this.saveEvents();
        }
        this.eventPendingPromotionId = null;
      }
    }

    this.savePosts();
    this.updateSocialNotificationBadge();
    this.dom.postDialog.close();
    this.render();
  }

  // File Share & Clipboard Helpers
  copyToClipboard(text, btnElement = null) {
    if (!text) return;
    const onSuccess = () => {
      if (btnElement) {
        const origText = btnElement.innerHTML;
        btnElement.innerHTML = '<svg class="ui-icon" style="width:12px;height:12px;vertical-align:middle"><use href="#icon-check"></use></svg> ' + this.t("copied_label");
        btnElement.classList.add("btn-copied");
        setTimeout(() => {
          btnElement.innerHTML = origText;
          btnElement.classList.remove("btn-copied");
        }, 2200);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        this.fallbackCopy(text, onSuccess);
      });
    } else {
      this.fallbackCopy(text, onSuccess);
    }
  }

  fallbackCopy(text, callback) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      if (callback) callback();
    } catch (e) {
      prompt(this.t("copied_label"), text);
    }
    document.body.removeChild(ta);
  }

  openShareLink(urlOrPath) {
    if (!urlOrPath) return;
    const clean = urlOrPath.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      window.open(clean, "_blank", "noopener,noreferrer");
    } else {
      // Local or network share path (e.g. \\server\share or f:\...)
      this.copyToClipboard(clean);
      alert((this.t("alert_share_path_detail")).replace("${path}", clean));
    }
  }

  // Post Detail Modal
  openPostDetailModal(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    this.currentDetailPostId = postId;
    const platform = this.getPlatform(post.platformId);
    const postType = this.getPostType(post.platformId, post.postTypeId);

    // Media renderer
    if (post.mediaType === "video") {
      this.dom.detailMediaBox.innerHTML = `
        <video src="${post.mediaUrl}" controls style="max-width: 100%; max-height: 420px;"></video>
      `;
    } else {
      this.dom.detailMediaBox.innerHTML = `
        <img src="${post.mediaUrl}" alt="Post Media" style="max-width: 100%; max-height: 420px; object-fit: contain;">
      `;
    }

    // Platform badge
    const iconSrc = this.getPlatformIcon(platform);
    this.dom.detailPlatformBadge.style.background = platform ? platform.color : "var(--primary)";
    this.dom.detailPlatformBadge.style.color = "#fff";
    this.dom.detailPlatformBadge.innerHTML = `
      <img class="platform-favicon" src="${iconSrc}" alt="" onerror="this.style.display='none'" style="filter: brightness(1.2);">
      <span>${platform ? platform.name : post.platformId}</span>
    `;

    this.dom.detailTitle.textContent = post.title || "Untitled Post";
    this.dom.detailDateTime.textContent = `${post.date} at ${post.time || "12:00"}`;
    this.dom.detailPostType.textContent = `${postType ? postType.name : "Post"} (${post.aspectRatio || '9:16'})`;
    
    const mediaCountStr = post.mediaCount > 1 ? ` (${post.mediaCount} slides)` : "";
    this.dom.detailMediaFormat.textContent = `${post.mediaType === 'video' ? 'Video clip' : 'Photo'}${mediaCountStr}`;
    
    this.dom.detailStatus.textContent = (post.status || "Scheduled").toUpperCase();
    this.dom.detailStatus.style.color = post.status === "published" ? "#10b981" : "#60a5fa";

    // Asset & File Share Section
    if (this.dom.detailShareBox) {
      if (post.shareLink) {
        this.dom.detailShareBox.style.display = "block";
        this.dom.detailShareBox.classList.remove("empty");
        this.dom.detailShareLinkText.textContent = post.shareLink;
        this.dom.detailShareLinkText.href = post.shareLink.startsWith("http") ? post.shareLink : "#";
        this.dom.detailShareLinkText.onclick = (e) => {
          if (!post.shareLink.startsWith("http")) {
            e.preventDefault();
            this.openShareLink(post.shareLink);
          }
        };
        if (this.dom.btnDetailOpenShare) {
          this.dom.btnDetailOpenShare.style.display = "inline-flex";
          this.dom.btnDetailOpenShare.onclick = (e) => {
            e.preventDefault();
            this.openShareLink(post.shareLink);
          };
        }
        if (this.dom.btnDetailCopyShare) this.dom.btnDetailCopyShare.style.display = "inline-flex";
        if (this.dom.detailShareStatusBadge) this.dom.detailShareStatusBadge.textContent = "Assets Linked";
      } else {
        this.dom.detailShareBox.style.display = "block";
        this.dom.detailShareBox.classList.add("empty");
        this.dom.detailShareLinkText.textContent = "No external file share attached. (Click Edit Post to attach Drive, Dropbox, or Server share)";
        this.dom.detailShareLinkText.removeAttribute("href");
        this.dom.detailShareLinkText.onclick = null;
        if (this.dom.btnDetailOpenShare) this.dom.btnDetailOpenShare.style.display = "none";
        if (this.dom.btnDetailCopyShare) this.dom.btnDetailCopyShare.style.display = "none";
        if (this.dom.detailShareStatusBadge) this.dom.detailShareStatusBadge.textContent = "No Share Attached";
      }
    }

    this.dom.detailDescBox.textContent = post.description || "No caption provided.";

    this.dom.detailDialog.showModal();
  }

  deleteCurrentDetailPost() {
    if (!this.currentDetailPostId) return;
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_delete"));
      return;
    }
    if (confirm(this.t("confirm_delete_post"))) {
      this.posts = this.posts.filter(p => p.id !== this.currentDetailPostId);
      this.savePosts();
      this.dom.detailDialog.close();
      this.render();
    }
  }

  duplicateCurrentDetailPost() {
    const post = this.posts.find(p => p.id === this.currentDetailPostId);
    if (!post) return;
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save_post"));
      return;
    }

    const duplicated = {
      ...post,
      id: `post-${Date.now()}`,
      title: `${post.title} (Copy)`,
      status: "draft"
    };

    this.posts.push(duplicated);
    this.savePosts();
    this.dom.detailDialog.close();
    this.render();
    alert(this.t("alert_post_duplicated"));
  }

  // Control Panel Handling
  openControlPanelModal() {
    this.renderControlPanelPlatformsList();
    this.dom.controlPanelDialog.showModal();
  }

  renderControlPanelPlatformsList() {
    this.dom.cpPlatformsList.innerHTML = "";

    this.platforms.forEach((platform, pIdx) => {
      const card = document.createElement("div");
      const isEnabled = platform.enabled !== false;
      card.className = `cp-platform-card ${isEnabled ? "" : "is-disabled"}`;

      const iconSrc = this.getPlatformIcon(platform);
      card.innerHTML = `
        <div class="cp-platform-header">
          <div class="cp-platform-title">
            <img class="platform-favicon-lg" src="${iconSrc}" alt="" onerror="this.style.display='none'">
            <span>${platform.name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label class="cp-platform-toggle-label" title="Toggle platform visibility across calendar, filters, and post creation">
              <span class="cp-platform-status-text">${isEnabled ? this.t("cp_status_active") : this.t("cp_status_disabled")}</span>
              <div class="toggle-switch">
                <input type="checkbox" class="cp-platform-enable-toggle" data-pid="${platform.id}" ${isEnabled ? "checked" : ""}>
                <span class="slider"></span>
              </div>
            </label>
            <button class="btn btn-secondary btn-sm cp-add-pt-btn" data-pid="${platform.id}">+ ${this.t("cp_add_post_type")}</button>
            ${this.platforms.length > 1 ? `<button class="btn btn-danger btn-sm cp-delete-platform-btn" data-pid="${platform.id}">${this.t("cp_remove")}</button>` : ""}
          </div>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">${platform.description || this.t("cp_default_description")}</p>
        <div class="cp-posttypes-container" id="cp-pt-container-${platform.id}"></div>
      `;

      // Slider toggle for enable / disable
      const toggleCheckbox = card.querySelector(".cp-platform-enable-toggle");
      const statusText = card.querySelector(".cp-platform-status-text");
      toggleCheckbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        platform.enabled = checked;
        statusText.textContent = checked ? this.t("cp_status_active") : this.t("cp_status_disabled");
        card.classList.toggle("is-disabled", !checked);
        this.savePlatforms();
        this.render();
      });

      const ptContainer = card.querySelector(`#cp-pt-container-${platform.id}`);

      platform.postTypes.forEach((pt, ptIdx) => {
        const ptItem = document.createElement("div");
        ptItem.className = "cp-posttype-item";

        ptItem.innerHTML = `
          <div>
            <label style="font-size: 0.68rem; color: var(--text-muted); display: block;">${this.t("cp_type_name")}</label>
            <input type="text" class="cp-input-sm cp-edit-pt-name" value="${this.escapeHtml(pt.name)}">
          </div>
          <div>
            <label style="font-size: 0.68rem; color: var(--text-muted); display: block;">${this.t("cp_aspect_ratio")}</label>
            <input type="text" class="cp-input-sm cp-edit-pt-ratio" value="${this.escapeHtml(pt.aspectRatio)}">
          </div>
          <div>
            <label style="font-size: 0.68rem; color: var(--text-muted); display: block;">${this.t("cp_width")}</label>
            <input type="number" class="cp-input-sm cp-edit-pt-width" value="${pt.recommendedWidth}">
          </div>
          <div>
            <label style="font-size: 0.68rem; color: var(--text-muted); display: block;">${this.t("cp_height")}</label>
            <input type="number" class="cp-input-sm cp-edit-pt-height" value="${pt.recommendedHeight}">
          </div>
          <div>
            <label style="font-size: 0.68rem; color: var(--text-muted); display: block;">${this.t("cp_action")}</label>
            <button type="button" class="btn btn-danger btn-sm cp-delete-pt-btn" title="${this.t("cp_delete_post_type")}">&times;</button>
          </div>
        `;

        // Live input bindings to update state
        ptItem.querySelector(".cp-edit-pt-name").addEventListener("change", (e) => {
          pt.name = e.target.value.trim();
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-edit-pt-ratio").addEventListener("change", (e) => {
          pt.aspectRatio = e.target.value.trim();
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-edit-pt-width").addEventListener("change", (e) => {
          pt.recommendedWidth = parseInt(e.target.value, 10) || 1080;
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-edit-pt-height").addEventListener("change", (e) => {
          pt.recommendedHeight = parseInt(e.target.value, 10) || 1920;
          this.savePlatforms();
        });
        ptItem.querySelector(".cp-delete-pt-btn").addEventListener("click", () => {
          if (platform.postTypes.length <= 1) {
            alert(this.t("alert_posttype_required"));
            return;
          }
          platform.postTypes.splice(ptIdx, 1);
          this.savePlatforms();
          this.renderControlPanelPlatformsList();
        });

        ptContainer.appendChild(ptItem);
      });

      // Add post type button
      card.querySelector(".cp-add-pt-btn").addEventListener("click", () => {
        const typeName = prompt("Enter new post type name (e.g., Square Carousel, Story, Live Clip):");
        if (typeName) {
          platform.postTypes.push({
            id: `${platform.id}-custom-${Date.now()}`,
            name: typeName.trim(),
            mediaType: "photo",
            aspectRatio: "1:1",
            recommendedWidth: 1080,
            recommendedHeight: 1080,
            format: "JPG / PNG / MP4",
            maxDuration: "Standard",
            maxFileSize: "25 MB",
            safeZone: "Centered content",
            captionLimit: 2200
          });
          this.savePlatforms();
          this.renderControlPanelPlatformsList();
        }
      });

      // Remove platform
      const deletePlatformBtn = card.querySelector(".cp-delete-platform-btn");
      if (deletePlatformBtn) {
        deletePlatformBtn.addEventListener("click", () => {
          if (confirm(this.t("confirm_remove_platform").replace("${name}", platform.name))) {
            this.platforms = this.platforms.filter(p => p.id !== platform.id);
            this.savePlatforms();
            this.renderControlPanelPlatformsList();
            this.render();
          }
        });
      }

      this.dom.cpPlatformsList.appendChild(card);
    });
  }

  handleAddPlatform(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save"));
      return;
    }
    const name = this.dom.newPlatformName.value.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + `-${Date.now().toString().slice(-4)}`;
    const color = this.dom.newPlatformColor.value || "#3b82f6";
    const domain = this.dom.newPlatformDomain ? this.dom.newPlatformDomain.value.trim() : "";
    const iconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";
    const desc = this.dom.newPlatformDesc.value.trim() || `${name} content`;

    const newPlatform = {
      id: id,
      name: name,
      domain: domain,
      iconUrl: iconUrl,
      enabled: true,
      color: color,
      accentColor: color,
      icon: "custom",
      description: desc,
      postTypes: [
        {
          id: `${id}-standard`,
          name: "Standard Post (1:1 / 4:5)",
          mediaType: "photo",
          aspectRatio: "4:5",
          recommendedWidth: 1080,
          recommendedHeight: 1350,
          format: "JPG / PNG / MP4",
          maxDuration: "Standard",
          maxFileSize: "30 MB",
          safeZone: "Full screen safe zone",
          captionLimit: 2200
        },
        {
          id: `${id}-video`,
          name: "Vertical Video (9:16)",
          mediaType: "video",
          aspectRatio: "9:16",
          recommendedWidth: 1080,
          recommendedHeight: 1920,
          format: "MP4 / MOV",
          maxDuration: "60s",
          maxFileSize: "250 MB",
          safeZone: "9:16 mobile view",
          captionLimit: 2200
        }
      ]
    };

    this.platforms.push(newPlatform);
    this.savePlatforms();
    this.dom.addPlatformForm.reset();
    this.renderControlPanelPlatformsList();
    this.render();
    alert((this.t("alert_platform_added")).replace("${name}", name));
  }

  resetAllDefaults() {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save"));
      return;
    }
    if (confirm(this.t("confirm_reset_platforms"))) {
      localStorage.removeItem(STORAGE_PLATFORMS_KEY);
      localStorage.removeItem(STORAGE_POSTS_KEY);
      this.platforms = JSON.parse(JSON.stringify(DEFAULT_PLATFORMS));
      this.posts = JSON.parse(JSON.stringify(INITIAL_POSTS));
      this.savePlatforms();
      this.savePosts();
      this.renderControlPanelPlatformsList();
      this.render();
      alert(this.t("alert_reset_complete"));
    }
  }

  exportData() {
    const backup = {
      version: "2026.1",
      exportedAt: new Date().toISOString(),
      platforms: this.platforms,
      posts: this.posts
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social-calendar-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importData(e) {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save"));
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.platforms && Array.isArray(data.platforms)) {
          this.platforms = data.platforms.map(p => {
            if (p.enabled === undefined) p.enabled = true;
            return p;
          });
          this.savePlatforms();
        }
        if (data.posts && Array.isArray(data.posts)) {
          this.posts = data.posts;
          this.savePosts();
        }
        this.renderControlPanelPlatformsList();
        this.render();
        alert(this.t("alert_import_success"));
      } catch (err) {
        alert(this.t("alert_import_fail"));
      }
    };
    reader.readAsText(file);
  }

  // 2026 Aggregated Standards Matrix Modal
  openStandardsModal() {
    this.dom.standardsTableBody.innerHTML = "";

    const enabledPlatforms = this.platforms.filter(p => p.enabled !== false);
    if (enabledPlatforms.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No active platforms enabled. Enable platforms in Control Panel.</td>`;
      this.dom.standardsTableBody.appendChild(tr);
      this.dom.standardsDialog.showModal();
      return;
    }

    enabledPlatforms.forEach(platform => {
      const iconSrc = this.getPlatformIcon(platform);
      platform.postTypes.forEach(pt => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <span class="platform-pill-badge" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: ${platform.color};">
              <img class="platform-favicon" src="${iconSrc}" alt="" onerror="this.style.display='none'">
              ${platform.name}
            </span>
          </td>
          <td><strong>${pt.name}</strong></td>
          <td><span class="standards-badge-ratio">${pt.aspectRatio}</span></td>
          <td><code style="color: var(--text-primary); font-family: var(--font-mono);">${pt.recommendedWidth} × ${pt.recommendedHeight} px</code></td>
          <td style="color: var(--text-secondary); font-size: 0.75rem;">${pt.format}</td>
          <td style="color: var(--text-muted); font-size: 0.75rem;">${pt.safeZone || "Centered"}</td>
        `;
        this.dom.standardsTableBody.appendChild(tr);
      });
    });

    this.dom.standardsDialog.showModal();
  }

  // =========================================================================
  // VIEW NAVIGATION & SESSION MANAGEMENT
  // =========================================================================
  setAppView(viewName) {
    if (!this.currentUser && viewName !== "login") {
      this.setAppView("login");
      return;
    }

    // Security check: Regular users cannot access Social Calendar, Admin Panel or Portal
    if (this.currentUser && this.currentUser.role === "user") {
      if (viewName !== "events") {
        viewName = "events";
      }
    }

    this.activeApp = viewName;
    try {
      localStorage.setItem(STORAGE_ACTIVE_APP_KEY, viewName);
    } catch (e) { warnStorage(e); }

    // Containers
    if (this.dom.directLoginView) {
      this.dom.directLoginView.style.display = viewName === "login" ? "flex" : "none";
    }
    if (this.dom.socialCalendarApp) {
      this.dom.socialCalendarApp.style.display = viewName === "social" ? "block" : "none";
    }
    if (this.dom.eventsCalendarApp) {
      this.dom.eventsCalendarApp.style.display = viewName === "events" ? "block" : "none";
    }
    if (this.dom.adminApp) {
      this.dom.adminApp.style.display = viewName === "admin" ? "block" : "none";
    }

    // Universal Nav Bar
    if (viewName === "login") {
      this.dom.universalNavBar.style.display = "none";
    } else {
      this.dom.universalNavBar.style.display = "flex";
    }

    // Role-specific nav adjustments
    if (this.currentUser && this.currentUser.role === "user") {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "none";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "none";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navMyEventsBtn) this.dom.navMyEventsBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_sign_out");
    } else {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "inline-flex";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "inline-flex";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navMyEventsBtn) this.dom.navMyEventsBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_logout");
    }

    this.updateMyEventsBadgeCount();

    // Active menu tab indicator (tabs swapping through pages)
    if (this.dom.navEventsBtn) {
      const isCalendarTab = viewName === "events" && this.eventsLayoutMode === "panel";
      this.dom.navEventsBtn.classList.toggle("active", isCalendarTab);
      this.dom.navEventsBtn.setAttribute("aria-selected", isCalendarTab ? "true" : "false");
    }
    if (this.dom.navScheduleBtn) {
      const isScheduleTab = viewName === "events" && this.eventsLayoutMode === "schedule";
      this.dom.navScheduleBtn.classList.toggle("active", isScheduleTab);
      this.dom.navScheduleBtn.setAttribute("aria-selected", isScheduleTab ? "true" : "false");
    }
    if (this.dom.navMyEventsBtn) {
      const isMyEventsTab = viewName === "events" && this.eventsLayoutMode === "my-events";
      this.dom.navMyEventsBtn.classList.toggle("active", isMyEventsTab);
      this.dom.navMyEventsBtn.setAttribute("aria-selected", isMyEventsTab ? "true" : "false");
    }
    if (this.dom.navSocialBtn) {
      this.dom.navSocialBtn.classList.toggle("active", viewName === "social");
      this.dom.navSocialBtn.setAttribute("aria-selected", viewName === "social" ? "true" : "false");
    }
    if (this.dom.navAdminBtn) {
      this.dom.navAdminBtn.classList.toggle("active", viewName === "admin");
      this.dom.navAdminBtn.setAttribute("aria-selected", viewName === "admin" ? "true" : "false");
    }

    // Nav user pill
    if (this.currentUser) {
      this.dom.navUserPill.style.display = "inline-flex";
      this.dom.navUserAvatar.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-user"></use></svg>';
      const cleanName = (this.currentUser.name || this.currentUser.username || "").replace(/\s*\([^)]*\)/g, "").trim();
      this.dom.navUserName.textContent = cleanName;
      if (this.isDemoAccount()) {
        this.dom.navUserRole.textContent = this.t("demo_badge");
        this.dom.navUserRole.className = "user-role-badge role-demo";
      } else {
        this.dom.navUserRole.textContent = this.currentUser.role;
        this.dom.navUserRole.className = `user-role-badge ${this.currentUser.role === "admin" ? "role-admin" : ""}`;
      }
      if (this.currentUser.role === "admin") {
        this.updateStorageQuotaDisplay();
      }
    } else {
      this.dom.navUserPill.style.display = "none";
    }

    // Render corresponding sub-app
    if (viewName === "social") {
      this.syncSocialViewMode();
      this.render();
      this.updateSocialNotificationBadge();
    } else if (viewName === "events") {
      const mode = this.eventsLayoutMode || "panel";
      this.setEventsLayoutMode(mode);
    } else if (viewName === "admin") {
      this.renderAdminPanel();
    }

    this.updateUserNavDisplay();
  }

  updateUserNavDisplay() {
    if (!this.dom || !this.dom.navUserPill) return;

    if (this.currentUser) {
      this.dom.navUserPill.style.display = "inline-flex";
      if (this.dom.navUserAvatar) {
        this.dom.navUserAvatar.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-user"></use></svg>';
      }
      if (this.dom.navUserName) {
        const cleanName = (this.currentUser.name || this.currentUser.username || "").replace(/\s*\([^)]*\)/g, "").trim();
        this.dom.navUserName.textContent = cleanName;
      }
      if (this.dom.navUserRole) {
        if (this.isDemoAccount()) {
          this.dom.navUserRole.textContent = this.t("demo_badge");
          this.dom.navUserRole.className = "user-role-badge role-demo";
        } else {
          this.dom.navUserRole.textContent = this.currentUser.role;
          this.dom.navUserRole.className = `user-role-badge ${this.currentUser.role === "admin" ? "role-admin" : ""}`;
        }
      }
      if (this.currentUser.role === "admin") {
        this.updateStorageQuotaDisplay();
      }
    } else {
      this.dom.navUserPill.style.display = "none";
    }

    // Role-specific nav adjustments
    if (this.currentUser && this.currentUser.role === "user") {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "none";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "none";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_sign_out");
    } else if (this.currentUser && this.currentUser.role === "admin") {
      if (this.dom.navSocialBtn) this.dom.navSocialBtn.style.display = "inline-flex";
      if (this.dom.navAdminBtn) this.dom.navAdminBtn.style.display = "inline-flex";
      if (this.dom.navEventsBtn) this.dom.navEventsBtn.style.display = "inline-flex";
      if (this.dom.navScheduleBtn) this.dom.navScheduleBtn.style.display = "inline-flex";
      if (this.dom.navLogoutBtn) this.dom.navLogoutBtn.textContent = this.t("nav_logout");
    }
  }

  // =========================================================================
  // AUTHENTICATION & SERVER REST HANDLERS
  // =========================================================================
  async initServerAuth() {
    try {
      await this.resolveServerSession();
    } finally {
      document.documentElement.classList.remove("is-booting");
    }
  }

  async resolveServerSession() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
          await this.fetchServerUsers();
          if (this.currentUser.role === "admin") {
            const savedApp = localStorage.getItem(STORAGE_ACTIVE_APP_KEY) || "social";
            this.setAppView(savedApp === "login" ? "social" : savedApp);
          } else {
            this.setAppView("events");
          }
          this.updateUserNavDisplay();
          return;
        }
      }
    } catch (err) {
      console.warn("Server auth check fallback:", err);
    }

    // Default unauthenticated state
    this.currentUser = null;
    this.setAppView("login");
    this.updateUserNavDisplay();
  }

  // Admins get the full user list; everyone else gets the public directory (names/colours).
  async fetchServerUsers() {
    const url = this.currentUser?.role === "admin" ? "/api/users" : "/api/users/directory";
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      this.users = data;
      this.renderEventsUserFilterBar();
      if (this.activeApp === "admin") this.renderAdminPanel();
    } catch (err) {
      console.warn("Fetch server users error:", err);
    }
  }


  async handleDirectLoginSubmit(e) {
    e.preventDefault();
    const username = this.dom.directLoginUsername.value.trim().toLowerCase();
    const password = this.dom.directLoginPassword.value.trim();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.dom.directLoginErrorMsg.textContent = data.error || this.t("login_error_invalid");
        this.dom.directLoginErrorMsg.style.display = "block";
        return;
      }

      this.dom.directLoginErrorMsg.style.display = "none";
      this.currentUser = data.user;
      await this.fetchServerUsers();

      if (this.currentUser.role === "user") {
        this.setAppView("events");
      } else if (this.currentUser.role === "admin") {
        this.setAppView("social");
      } else {
        this.setAppView("events");
      }
      this.updateUserNavDisplay();
    } catch (err) {
      this.dom.directLoginErrorMsg.textContent = this.t("login_error_invalid");
      this.dom.directLoginErrorMsg.style.display = "block";
    }
  }

  openLoginDialog(targetApp = "events") {
    this.pendingLoginTarget = targetApp;
    this.dom.loginUsername.value = "";
    this.dom.loginPassword.value = "";
    this.dom.loginErrorMsg.style.display = "none";

    if (targetApp === "admin") {
      this.dom.loginSubtitle.textContent = this.t("login_subtitle_admin");
    } else {
      this.dom.loginSubtitle.textContent = this.t("login_subtitle_events");
    }

    this.dom.loginDialog.showModal();
    setTimeout(() => this.dom.loginUsername.focus(), 50);
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = this.dom.loginUsername.value.trim().toLowerCase();
    const password = this.dom.loginPassword.value.trim();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.dom.loginErrorMsg.textContent = data.error || this.t("login_error_invalid");
        this.dom.loginErrorMsg.style.display = "block";
        return;
      }

      const user = data.user;
      if (this.pendingLoginTarget === "admin" && user.role !== "admin") {
        this.dom.loginErrorMsg.textContent = this.t("login_error_no_admin").replace("${name}", user.name);
        this.dom.loginErrorMsg.style.display = "block";
        return;
      }

      this.currentUser = user;
      this.dom.loginDialog.close();
      await this.fetchServerUsers();

      if (user.role === "user") {
        this.setAppView("events");
      } else {
        const target = this.pendingLoginTarget === "admin" ? "admin" : (this.pendingLoginTarget === "events" ? "events" : "social");
        this.setAppView(target);
      }
      this.updateUserNavDisplay();
    } catch (err) {
      this.dom.loginErrorMsg.textContent = this.t("login_error_invalid");
      this.dom.loginErrorMsg.style.display = "block";
    }
  }

  async handleLogout() {
    this.currentUser = null;
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (err) { warnStorage(err); }
    try {
      localStorage.removeItem(STORAGE_ACTIVE_APP_KEY);
    } catch (err) { warnStorage(err); }
    this.setAppView("login");
    this.updateUserNavDisplay();
  }

  // =========================================================================
  // TEAM EVENTS CALENDAR LOGIC (3-Level Zoom & Navigation)
  // =========================================================================
  changeEventsPeriod(delta) {
    if (this.eventsZoomLevel === "daily") {
      // Shift active week by 7 days
      const [y, m, d] = (this.eventsActiveDate || this.getTodayDateString()).split("-").map(Number);
      const curr = new Date(y, m - 1, d);
      curr.setDate(curr.getDate() + (delta * 7));
      const ny = curr.getFullYear();
      const nm = String(curr.getMonth() + 1).padStart(2, "0");
      const nd = String(curr.getDate()).padStart(2, "0");
      this.eventsActiveDate = `${ny}-${nm}-${nd}`;
      this.eventsCurrentYear = curr.getFullYear();
      this.eventsCurrentMonth = curr.getMonth();
    } else if (this.eventsZoomLevel === "yearly") {
      // Shift by 1 year
      this.eventsCurrentYear += delta;
    } else {
      // Monthly mode: shift by 1 month
      this.eventsCurrentMonth += delta;
      if (this.eventsCurrentMonth < 0) {
        this.eventsCurrentMonth = 11;
        this.eventsCurrentYear--;
      } else if (this.eventsCurrentMonth > 11) {
        this.eventsCurrentMonth = 0;
        this.eventsCurrentYear++;
      }
      this.eventsActiveDate = `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-15`;
    }
    this.renderEventsCalendar();
  }

  jumpToEventsToday() {
    const today = new Date();
    this.eventsCurrentYear = today.getFullYear();
    this.eventsCurrentMonth = today.getMonth();
    this.eventsActiveDate = this.getTodayDateString();
    this.renderEventsCalendar();
  }

  stepZoom(delta) {
    // Zoom in (delta = +1): yearly -> monthly -> daily
    // Zoom out (delta = -1): daily -> monthly -> yearly
    const levels = ["yearly", "monthly", "daily"];
    const currentIdx = levels.indexOf(this.eventsZoomLevel);
    const newIdx = Math.max(0, Math.min(2, (currentIdx === -1 ? 1 : currentIdx) + delta));
    this.setEventsZoomLevel(levels[newIdx]);
  }

  setEventsZoomLevel(level, anchorDate = null) {
    if (!["daily", "monthly", "yearly"].includes(level)) level = "yearly";
    this.eventsZoomLevel = level;
    this.savePrefs();

    if (anchorDate) {
      this.eventsActiveDate = anchorDate;
      const [y, m] = anchorDate.split("-").map(Number);
      if (y && m) {
        this.eventsCurrentYear = y;
        this.eventsCurrentMonth = m - 1;
      }
    }

    // Toggle button active states
    if (this.dom.btnZoomDaily) this.dom.btnZoomDaily.classList.toggle("active", level === "daily");
    if (this.dom.btnZoomMonthly) this.dom.btnZoomMonthly.classList.toggle("active", level === "monthly");
    if (this.dom.btnZoomYearly) this.dom.btnZoomYearly.classList.toggle("active", level === "yearly");

    // Toggle view containers
    if (this.dom.eventsDailyView) this.dom.eventsDailyView.style.display = level === "daily" ? "flex" : "none";
    if (this.dom.eventsGridView) this.dom.eventsGridView.style.display = level === "monthly" ? "flex" : "none";
    if (this.dom.eventsYearlyView) this.dom.eventsYearlyView.style.display = level === "yearly" ? "block" : "none";

    this.renderEventsCalendar();
  }

  toggleOffHours() {
    this.eventsOffHoursExpanded = !this.eventsOffHoursExpanded;
    this.renderEventsCalendar();
  }

  getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  isPastEventDate(dateStr) {
    return Boolean(dateStr) && dateStr < this.getTodayDateString();
  }

  formatEventPrice(event) {
    if (!event?.price || String(event.price).trim().toLowerCase() === "free") return this.t("event_free");
    return `${event.price} ${event.currency || "RON"}`;
  }

  setEventsLayoutMode(mode) {
    if (mode === "schedule") {
      this.eventsLayoutMode = "schedule";
    } else if (mode === "my-events") {
      this.eventsLayoutMode = "my-events";
    } else {
      this.eventsLayoutMode = "panel";
    }
    this.savePrefs();

    const isCalendar = this.eventsLayoutMode === "panel";
    const isSchedule = this.eventsLayoutMode === "schedule";
    const isMyEvents = this.eventsLayoutMode === "my-events";

    if (this.dom.eventsHeaderBar) {
      this.dom.eventsHeaderBar.style.display = isCalendar ? "" : "none";
    }
    if (this.dom.eventsSimpleDropinView) {
      this.dom.eventsSimpleDropinView.style.display = isCalendar ? "none" : "block";
    }
    if (this.dom.schedulePageShell) {
      this.dom.schedulePageShell.style.display = isSchedule ? "block" : "none";
    }
    if (this.dom.myEventsPageShell) {
      this.dom.myEventsPageShell.style.display = isMyEvents ? "block" : "none";
    }
    if (this.dom.eventsAdvancedPanelView) {
      this.dom.eventsAdvancedPanelView.style.display = isCalendar ? "block" : "none";
    }
    if (this.dom.eventsZoomControl) {
      this.dom.eventsZoomControl.style.display = isCalendar ? "inline-flex" : "none";
    }

    if (this.dom.navEventsBtn) {
      const isCalendarTab = this.activeApp === "events" && isCalendar;
      this.dom.navEventsBtn.classList.toggle("active", isCalendarTab);
      this.dom.navEventsBtn.setAttribute("aria-selected", isCalendarTab ? "true" : "false");
    }
    if (this.dom.navScheduleBtn) {
      const isScheduleTab = this.activeApp === "events" && isSchedule;
      this.dom.navScheduleBtn.classList.toggle("active", isScheduleTab);
      this.dom.navScheduleBtn.setAttribute("aria-selected", isScheduleTab ? "true" : "false");
    }
    if (this.dom.navMyEventsBtn) {
      const isMyEventsTab = this.activeApp === "events" && isMyEvents;
      this.dom.navMyEventsBtn.classList.toggle("active", isMyEventsTab);
      this.dom.navMyEventsBtn.setAttribute("aria-selected", isMyEventsTab ? "true" : "false");
    }

    // Toggle openAddEventBtn label and visual style
    if (this.dom.openAddEventBtn) {
      this.dom.openAddEventBtn.title = this.t("events_schedule_btn");
    }

    this.updateMyEventsBadgeCount();

    if (isSchedule) {
      this.mountEventForm("page");
    } else if (isMyEvents) {
      this.mountEventForm("dialog");
      this.renderMyEventsPage();
    } else {
      this.mountEventForm("dialog");
      this.setEventsZoomLevel(this.eventsZoomLevel || "yearly");
    }
  }

  // =========================================================================
  // RECURRENT EVENTS LOGIC
  // =========================================================================
  computeRecurrenceDates(startDateStr, monthsCount) {
    if (!startDateStr || monthsCount <= 1) return [startDateStr];
    const [y, m, d] = startDateStr.split("-").map(Number);
    const dates = [];

    for (let i = 0; i < monthsCount; i++) {
      const targetMonthIndex = (m - 1) + i;
      const targetYear = y + Math.floor(targetMonthIndex / 12);
      const targetMonth = (targetMonthIndex % 12);

      const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const targetDay = Math.min(d, daysInTargetMonth);

      const formattedMonth = String(targetMonth + 1).padStart(2, "0");
      const formattedDay = String(targetDay).padStart(2, "0");
      dates.push(`${targetYear}-${formattedMonth}-${formattedDay}`);
    }
    return dates;
  }

  updateRecurrencePreviewHint() {
    const isChecked = this.dom.eventIsRecurrent && this.dom.eventIsRecurrent.checked;
    const hintEl = this.dom.eventRecurrencePreviewHint;
    const dateVal = this.dom.eventDateInput ? this.dom.eventDateInput.value : "";
    const monthsVal = this.dom.eventRecurrenceMonths ? parseInt(this.dom.eventRecurrenceMonths.value, 10) : 3;

    if (!hintEl) return;
    if (!isChecked || !dateVal) {
      hintEl.textContent = `Schedules monthly on the same day for ${monthsVal} months`;
      return;
    }

    const dates = this.computeRecurrenceDates(dateVal, monthsVal);
    const dateNames = dates.map(dt => {
      const [y, m, d] = dt.split("-").map(Number);
      const dtObj = new Date(y, m - 1, d);
      return dtObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    });

    const previewStr = dateNames.length <= 4 
      ? dateNames.join(", ") 
      : `${dateNames.slice(0, 3).join(", ")} ... ${dateNames[dateNames.length - 1]}`;

    hintEl.textContent = `${monthsVal} monthly sessions: ${previewStr}`;
  }

  // =========================================================================
  // SOCIAL CALENDAR: EVENT NOTIFICATIONS & PROMOTION POST GENERATOR
  // =========================================================================
  updateSocialNotificationBadge() {
    const pendingEvents = this.events.filter(e => !e.socialStatus || e.socialStatus === "pending");
    const promotedEvents = this.events.filter(e => e.socialStatus === "promoted");
    const count = pendingEvents.length;

    if (this.dom.socialNotificationsCount) {
      this.dom.socialNotificationsCount.textContent = count;
      if (count > 0) {
        this.dom.socialNotificationsCount.classList.add("has-pending");
      } else {
        this.dom.socialNotificationsCount.classList.remove("has-pending");
      }
    }

    if (this.dom.notifCountAll) this.dom.notifCountAll.textContent = this.events.length;
    if (this.dom.notifCountPending) this.dom.notifCountPending.textContent = pendingEvents.length;
    if (this.dom.notifCountPromoted) this.dom.notifCountPromoted.textContent = promotedEvents.length;
  }

  openSocialNotificationsModal() {
    this.updateSocialNotificationBadge();
    this.renderSocialNotifications();
    this.dom.socialNotificationsModal.showModal();
  }

  renderSocialNotifications() {
    if (!this.dom.socialNotificationsList) return;
    this.dom.socialNotificationsList.innerHTML = "";

    let list = [...this.events];
    if (this.notifFilter === "pending") {
      list = list.filter(e => !e.socialStatus || e.socialStatus === "pending");
    } else if (this.notifFilter === "promoted") {
      list = list.filter(e => e.socialStatus === "promoted");
    }

    // Sort newest / upcoming first
    list.sort((a, b) => new Date(`${b.date}T${b.time || '00:00'}`) - new Date(`${a.date}T${a.time || '00:00'}`));

    if (list.length === 0) {
      this.dom.socialNotificationsList.innerHTML = `
        <div class="notif-empty-state">
          <div>${this.t("notif_no_events")}</div>
          <p>${this.t("notif_no_events_detail")}</p>
        </div>
      `;
      return;
    }

    list.forEach(evt => {
      const isPromoted = evt.socialStatus === "promoted";
      const card = document.createElement("div");
      card.className = `event-notification-card ${isPromoted ? 'is-promoted' : 'is-pending'}`;
      
      const eventDate = evt.startDate || evt.date;
      const eventTime = evt.hour || evt.time;
      const eventLength = evt.durationHours ? `${evt.durationHours}h` : "";
      const dateParts = [eventDate, eventTime, eventLength].filter(Boolean).join(" · ");
      const creator = evt.creatorName || evt.creatorUsername || "Mentor";
      const status = isPromoted ? this.t("promo_posted") : this.t("promo_pending");

      card.innerHTML = `
        <div class="notif-card-main">
          <div class="notif-card-title-row">
            <div class="notif-title">${this.escapeHtml(evt.title)}</div>
            ${this.notifFilter === "all" ? `
          <span class="promo-status-badge ${isPromoted ? 'promoted' : 'pending'}">
            ${status}
          </span>` : ""}
          </div>
          <div class="notif-meta">
            <span>${this.escapeHtml(dateParts)}</span>
            <span>${this.escapeHtml(creator)}</span>
            ${evt.price ? `<span>${this.escapeHtml(this.formatEventPrice(evt))}</span>` : ""}
          </div>
        </div>
        <div class="notif-card-action">
          ${isPromoted
            ? `<button class="btn btn-secondary btn-sm btn-re-promote" data-id="${evt.id}">${this.t("notif_create_another")}</button>`
            : `<button class="btn btn-primary btn-sm btn-promote-event" data-id="${evt.id}">${this.t("notif_create_post")}</button>`}
        </div>
      `;

      const promoteBtn = card.querySelector(".btn-promote-event") || card.querySelector(".btn-re-promote");
      if (promoteBtn) {
        promoteBtn.addEventListener("click", () => {
          this.generateSocialPostFromEvent(evt.id);
        });
      }

      this.dom.socialNotificationsList.appendChild(card);
    });
  }

  generateSocialPostFromEvent(eventId) {
    const evt = this.events.find(e => e.id === eventId);
    if (!evt) return;

    // If notifications modal is open, close it
    if (this.dom.socialNotificationsModal && this.dom.socialNotificationsModal.open) {
      this.dom.socialNotificationsModal.close();
    }

    // Switch to social view if not currently active
    if (this.activeApp !== "social") {
      this.setAppView("social");
    }

    // Prepare campaign marketing copy
    const title = `🚀 Upcoming Session: ${evt.title}`;
    const dateStr = evt.startDate || evt.date;
    const timeStr = evt.hour || evt.time || "18:00";
    const priceStr = evt.price ? this.formatEventPrice(evt) : "Free Access";
    const enrollStr = evt.enrollLink ? `\n\n🔗 Reserve your spot: ${evt.enrollLink}` : "";
    const mentorStr = evt.creatorName ? `Hosted by ${evt.creatorName}` : "";
    
    let description = `${title}\n${mentorStr ? mentorStr + '\n' : ''}\n📅 Date: ${dateStr} at ${timeStr}\n🎟️ Admission: ${priceStr}${enrollStr}`;
    if (evt.description) {
      description += `\n\nAbout this session:\n${evt.description}`;
    }

    this.openAddPostModal(dateStr, {
      eventId: evt.id,
      title: title,
      description: description,
      date: dateStr,
      time: timeStr,
      mediaUrl: evt.facebookImage
    });
  }

  getWeekDays(anchorDateStr) {
    const [y, m, d] = (anchorDateStr || this.getTodayDateString()).split("-").map(Number);
    const anchor = new Date(y, m - 1, d);
    let dayOfWeek = anchor.getDay() - 1; // Mon=0, Tue=1, ..., Sun=6
    if (dayOfWeek < 0) dayOfWeek = 6;

    const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dayOfWeek);
    const weekDays = [];
    const dayNames = WEEKDAY_NAMES[this.currentLang] || WEEKDAY_NAMES.ro;

    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const dy = dt.getFullYear();
      const dm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      const dateStr = `${dy}-${dm}-${dd}`;
      weekDays.push({
        dateStr,
        dayName: dayNames[i],
        dayNumber: dt.getDate(),
        isWeekend: i === 5 || i === 6,
        dateObj: dt
      });
    }
    return weekDays;
  }

  getFilteredEvents() {
    return this.events.filter(event => {
      const start = event.startDate || event.date;
      const end = event.endDate || event.startDate || event.date;
      if (!start) return false;

      // User Filter check
      if (this.eventsSelectedUser !== "all") {
        if (this.eventsSelectedUser === "my") {
          const isOwn = this.currentUser && (event.creatorId === this.currentUser.id || event.creatorUsername === this.currentUser.username);
          if (!isOwn) return false;
        } else {
          if (event.creatorUsername !== this.eventsSelectedUser && event.creatorId !== this.eventsSelectedUser) {
            return false;
          }
        }
      }

      // Time Range Filter check according to zoom level
      if (this.eventsZoomLevel === "yearly") {
        const [sy] = start.split("-").map(Number);
        const [ey] = (end || start).split("-").map(Number);
        return sy <= this.eventsCurrentYear && ey >= this.eventsCurrentYear;
      }

      if (this.eventsZoomLevel === "daily") {
        const weekDays = this.getWeekDays(this.eventsActiveDate);
        const weekStart = weekDays[0].dateStr;
        const weekEnd = weekDays[6].dateStr;
        return start <= weekEnd && end >= weekStart;
      }

      // Monthly mode
      const [sy, sm] = start.split("-").map(Number);
      const isStartInMonth = sy === this.eventsCurrentYear && sm === (this.eventsCurrentMonth + 1);

      let spansThisMonth = isStartInMonth;
      if (end && end !== start) {
        const [ey, em] = end.split("-").map(Number);
        const isEndInMonth = ey === this.eventsCurrentYear && em === (this.eventsCurrentMonth + 1);
        if (isEndInMonth) spansThisMonth = true;

        const monthStartStr = `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-01`;
        const lastDayOfMonth = new Date(this.eventsCurrentYear, this.eventsCurrentMonth + 1, 0).getDate();
        const monthEndStr = `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
        if (start <= monthEndStr && end >= monthStartStr) {
          spansThisMonth = true;
        }
      }

      return spansThisMonth;
    });
  }

  renderEventsCalendar() {
    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;
    const shortMonthNames = SHORT_MONTH_NAMES[this.currentLang] || SHORT_MONTH_NAMES.ro;

    // Adapt Header and Banner titles according to active Zoom level
    if (this.eventsZoomLevel === "daily") {
      const weekDays = this.getWeekDays(this.eventsActiveDate);
      const startD = weekDays[0].dateObj;
      const endD = weekDays[6].dateObj;
      const startM = `${shortMonthNames[startD.getMonth()]} ${startD.getDate()}`;
      const endM = `${shortMonthNames[endD.getMonth()]} ${endD.getDate()}, ${endD.getFullYear()}`;
      const rangeTitle = `${startM} – ${endM}`;
      this.dom.eventsCurrentMonthLabel.textContent = rangeTitle;
    } else if (this.eventsZoomLevel === "yearly") {
      const yearTitle = `${this.t("yearly_overview_title")} ${this.eventsCurrentYear}`;
      this.dom.eventsCurrentMonthLabel.textContent = yearTitle;
    } else {
      const monthTitle = `${monthNames[this.eventsCurrentMonth]} ${this.eventsCurrentYear}`;
      this.dom.eventsCurrentMonthLabel.textContent = monthTitle;
    }

    // Render user filter bar
    this.renderEventsUserFilterBar();

    const filtered = this.getFilteredEvents();

    // Render view corresponding to active Zoom Level
    if (this.eventsZoomLevel === "daily") {
      this.renderEventsDailyTimeline(filtered);
    } else if (this.eventsZoomLevel === "yearly") {
      this.renderEventsYearlyView(filtered);
    } else {
      this.renderEventsGrid(filtered);
    }

    // Always keep my-events badge & notification badges up to date
    this.updateMyEventsBadgeCount();
    this.updateSocialNotificationBadge();
  }

  renderEventsUserFilterBar() {
    if (!this.dom.eventsUserFilterBar) return;
    this.dom.eventsUserFilterBar.innerHTML = "";

    // Calculate count per user for current time frame
    const userCounts = { all: 0 };
    this.events.forEach(evt => {
      const start = evt.startDate || evt.date;
      const end = evt.endDate || evt.startDate || evt.date;
      if (!start) return;

      let isInRange = false;
      if (this.eventsZoomLevel === "yearly") {
        const [sy] = start.split("-").map(Number);
        const [ey] = (end || start).split("-").map(Number);
        isInRange = sy <= this.eventsCurrentYear && ey >= this.eventsCurrentYear;
      } else if (this.eventsZoomLevel === "daily") {
        const weekDays = this.getWeekDays(this.eventsActiveDate);
        const weekStart = weekDays[0].dateStr;
        const weekEnd = weekDays[6].dateStr;
        isInRange = start <= weekEnd && end >= weekStart;
      } else {
        const [sy, sm] = start.split("-").map(Number);
        const isStartInMonth = sy === this.eventsCurrentYear && sm === (this.eventsCurrentMonth + 1);
        isInRange = isStartInMonth;
        if (end && end !== start) {
          const [ey, em] = end.split("-").map(Number);
          if (ey === this.eventsCurrentYear && em === (this.eventsCurrentMonth + 1)) isInRange = true;
        }
      }

      if (isInRange) {
        userCounts.all++;
        const u = evt.creatorUsername;
        userCounts[u] = (userCounts[u] || 0) + 1;
      }
    });

    // "All Users" pill
    const allBtn = document.createElement("button");
    allBtn.className = `user-filter-pill ${this.eventsSelectedUser === "all" ? "active" : ""}`;
    allBtn.innerHTML = `
      <span>${this.t("events_filter_all_users")}</span>
      <span class="user-filter-count">${userCounts.all || 0}</span>
    `;
    allBtn.addEventListener("click", () => {
      this.eventsSelectedUser = "all";
      this.savePrefs();
      this.renderEventsCalendar();
    });
    this.dom.eventsUserFilterBar.appendChild(allBtn);

    // "My Events" pill (if user is signed in)
    if (this.currentUser) {
      const myCount = userCounts[this.currentUser.username] || 0;
      const myBtn = document.createElement("button");
      myBtn.className = `user-filter-pill ${this.eventsSelectedUser === "my" ? "active" : ""}`;
      myBtn.innerHTML = `
        <span>${this.t("events_filter_my_events")}</span>
        <span class="user-filter-count">${myCount}</span>
      `;
      myBtn.addEventListener("click", () => {
        this.eventsSelectedUser = "my";
        this.savePrefs();
        this.renderEventsCalendar();
      });
      this.dom.eventsUserFilterBar.appendChild(myBtn);
    }

    // Individual users pills
    this.users.forEach(user => {
      const theme = this.getEventTheme({ creatorUsername: user.username, creatorId: user.id });
      const count = userCounts[user.username] || 0;
      const isSelected = this.eventsSelectedUser === user.username;
      const uBtn = document.createElement("button");
      uBtn.className = `user-filter-pill ${isSelected ? "active" : ""}`;
      if (isSelected) {
        uBtn.style.borderColor = theme.accent;
        uBtn.style.boxShadow = `0 0 12px ${theme.glow}`;
      }
      uBtn.innerHTML = `
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${theme.accent}; box-shadow: 0 0 8px ${theme.accent};"></span>
          ${this.escapeHtml(user.name)}
        </span>
        <span class="user-filter-count">${count}</span>
      `;
      uBtn.addEventListener("click", () => {
        this.eventsSelectedUser = user.username;
        this.savePrefs();
        this.renderEventsCalendar();
      });
      this.dom.eventsUserFilterBar.appendChild(uBtn);
    });
  }

  // =========================================================================
  // ZOOM LEVEL 1: DAILY TIMELINE VIEW (8am - 10pm & Day Columns)
  // =========================================================================
  renderEventsDailyTimeline(filteredEvents) {
    if (!this.dom.dailyTimelineHeaderBar || !this.dom.dailyTimelineBody) return;

    const weekDays = this.getWeekDays(this.eventsActiveDate);
    const today = new Date();
    const realTodayStr = this.getTodayDateString();

    // 1. Build Header Bar (Spacer + 7 Day Column Headers)
    this.dom.dailyTimelineHeaderBar.innerHTML = `
      <button type="button" class="timeline-time-header-spacer timeline-offhours-header-btn" title="${this.eventsOffHoursExpanded ? this.t("daily_hide_offhours") : this.t("daily_show_offhours")}">${this.eventsOffHoursExpanded ? this.t("daily_hide_offhours") : this.t("daily_show_offhours")}</button>
      <div class="timeline-day-headers-row" id="timeline-day-headers-row"></div>
    `;
    const headersRow = document.getElementById("timeline-day-headers-row");
    this.dom.dailyTimelineHeaderBar.querySelector(".timeline-offhours-header-btn")?.addEventListener("click", () => this.toggleOffHours());

    weekDays.forEach(day => {
      const isToday = day.dateStr === realTodayStr;
      const isPast = this.isPastEventDate(day.dateStr);
      const headerCell = document.createElement("div");
      headerCell.className = `timeline-day-header-cell ${day.isWeekend ? 'weekend-header' : ''} ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}`;
      headerCell.innerHTML = `
        <div class="timeline-day-title-wrap">
          <span class="timeline-day-name">${day.dayName}</span>
          <span class="timeline-day-number">${day.dayNumber}</span>
        </div>
        ${isPast ? "" : `<button type="button" class="btn-timeline-add-day" title="Schedule event on ${day.dateStr}" data-date="${day.dateStr}">+</button>`}
      `;

      headerCell.querySelector(".btn-timeline-add-day")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openAddEventModal(day.dateStr);
      });

      headersRow.appendChild(headerCell);
    });

    // 2. Build Timeline Body (Left Time Column + Right Day Columns Grid)
    this.dom.dailyTimelineBody.innerHTML = "";

    // Time Column
    const timeCol = document.createElement("div");
    timeCol.className = "timeline-time-col";

    // 8:00 AM to 10:00 PM (14 hour marks)
    let timeHtml = "";
    if (this.eventsOffHoursExpanded) {
      for (let h = 0; h < 8; h++) {
        timeHtml += `<div class="timeline-hour-marker" style="opacity: 0.5;">${String(h).padStart(2, "0")}:00</div>`;
      }
    }

    for (let h = 8; h <= 22; h++) {
      timeHtml += `<div class="timeline-hour-marker">${String(h).padStart(2, "0")}:00</div>`;
    }

    if (this.eventsOffHoursExpanded) {
      for (let h = 23; h <= 23; h++) {
        timeHtml += `<div class="timeline-hour-marker" style="opacity: 0.5;">${String(h).padStart(2, "0")}:00</div>`;
      }
    }

    timeCol.innerHTML = timeHtml;
    this.dom.dailyTimelineBody.appendChild(timeCol);

    // Days Columns Container
    const daysWrap = document.createElement("div");
    daysWrap.className = "timeline-days-col-wrap";

    const baseStartHour = this.eventsOffHoursExpanded ? 0 : 8;
    const baseEndHour = this.eventsOffHoursExpanded ? 24 : 22;
    const hourHeight = 68;

    weekDays.forEach(day => {
      const isToday = day.dateStr === realTodayStr;
      const isPast = this.isPastEventDate(day.dateStr);
      const dayCol = document.createElement("div");
      dayCol.className = `timeline-day-column ${day.isWeekend ? 'weekend-col' : ''} ${isToday ? 'is-today-col' : ''} ${isPast ? 'is-past-col' : ''}`;
      dayCol.dataset.date = day.dateStr;
      if (isPast) dayCol.dataset.pastScheduleMessage = this.t("event_past_create_unavailable");

      // Render hour slots in the column
      const currentHour = today.getHours();
      for (let h = baseStartHour; h < baseEndHour; h++) {
        const slot = document.createElement("div");
        slot.className = "timeline-hour-slot";
        if (isToday && h === new Date().getHours()) slot.classList.add("is-current-hour");
        const isPastHour = isToday && h < currentHour;
        if (isPastHour) {
          slot.classList.add("is-past-hour");
          slot.setAttribute("aria-disabled", "true");
          slot.title = this.t("event_past_create_unavailable");
        }
        const hourStr = `${String(h).padStart(2, "0")}:00`;
        slot.innerHTML = (isPast || isPastHour) ? "" : `
          <button type="button" class="btn-slot-schedule" title="Schedule at ${hourStr}">+ ${hourStr}</button>
        `;
        slot.querySelector(".btn-slot-schedule")?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAddEventModal(day.dateStr);
          setTimeout(() => {
            if (this.dom.eventHourInput) this.dom.eventHourInput.value = hourStr;
          }, 30);
        });
        dayCol.appendChild(slot);
      }

      // Filter events occurring on this specific day
      const dayEvents = filteredEvents.filter(evt => {
        const s = evt.startDate || evt.date;
        const ed = evt.endDate || evt.startDate || evt.date;
        return day.dateStr >= s && day.dateStr <= ed;
      });

      // Render positioned event cards
      dayEvents.forEach(evt => {
        const separateHours = Array.isArray(evt.scheduledHours) && evt.scheduledHours.length > 1
          ? evt.scheduledHours
          : [];
        const displayHour = separateHours[0] || evt.hour || evt.time || "18:00";
        const [eh, em] = displayHour.split(":").map(Number);
        const startDec = eh + ((em || 0) / 60);
        const dur = separateHours.length ? 1 : (parseFloat(evt.durationHours) || 2);
        const endDec = startDec + dur;
        const endHourInt = Math.floor(endDec);
        const endMinInt = Math.round((endDec - endHourInt) * 60);
        const endHourStr = `${String(endHourInt).padStart(2, "0")}:${String(endMinInt).padStart(2, "0")}`;

        // Compute vertical pixel position
        const topPx = (startDec - baseStartHour) * hourHeight;
        const heightPx = Math.max(32, (dur * hourHeight) - 4);

        const theme = this.getEventTheme(evt);
        const card = document.createElement("div");
        card.className = "timeline-event-card";
        if (isToday && endDec <= currentHour + (today.getMinutes() / 60)) card.classList.add("is-past-hour");
        const isLocked = evt.entryType === "locked";
        const isRoomOnly = evt.entryType === "room_only";
        if (isLocked) {
          card.classList.add("is-locked-card");
        } else if (isRoomOnly) {
          card.classList.add("is-room-only-card");
        }
        card.style.top = `${topPx}px`;
        card.style.height = `${heightPx}px`;
        card.style.borderLeft = `5px solid ${theme.accent}`;
        card.style.background = this.getEventSurface(theme);
        card.style.boxShadow = `0 4px 16px ${theme.glow}`;

        const isOwn = this.currentUser && (evt.creatorId === this.currentUser.id || evt.creatorUsername === this.currentUser.username);
        const recurrentTag = evt.isRecurrent ? `<span style="color: #38bdf8; font-weight: 600; font-size: 0.65rem;">${evt.recurrenceIndex || 1}/${evt.recurrenceTotal || 1}</span>` : "";
        const creatorTagBg = this.theme === "light" ? this.hexToRgba(theme.accent, 0.13) : theme.tagBg;
        const creatorTagColor = this.theme === "light" ? "#334155" : theme.tagColor;

        const space = evt.spaceId ? (this.spaces || []).find(s => s.id === evt.spaceId) : null;
        const room = evt.roomId ? (this.rooms || []).find(r => r.id === evt.roomId) : null;

        let extraMeta = "";
        if (isLocked) {
          extraMeta += `<span class="event-pill-space-tag" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">🔒 ${this.t("entry_type_locked")}</span>`;
        } else if (isRoomOnly) {
          extraMeta += `<span class="event-pill-room-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">🛏️ ${this.t("entry_type_room_only")}</span>`;
        }
        if (space) {
          extraMeta += `<span class="event-pill-space-tag">📍 ${this.escapeHtml(space.name)}</span>`;
        }
        if (Array.isArray(evt.roomBookings) && evt.roomBookings.length > 0) {
          const roomNames = evt.roomBookings.map(b => {
            const rm = (this.rooms || []).find(r => r.id === b.roomId);
            return rm ? rm.name : b.roomId;
          }).join(", ");
          extraMeta += `<span class="event-pill-room-tag">🛏️ ${this.escapeHtml(roomNames)}</span>`;
        } else if (room) {
          extraMeta += `<span class="event-pill-room-tag">🛏️ ${this.escapeHtml(room.name)}</span>`;
        }

        card.innerHTML = `
          <div class="timeline-event-top">
            <span class="timeline-event-time">${displayHour} – ${endHourStr}</span>
            ${recurrentTag}
          </div>
          <div class="timeline-event-title">${isLocked ? '🔒 ' : (isRoomOnly ? '🛏️ ' : '')}${this.escapeHtml(evt.title)}</div>
          <div class="timeline-event-meta" style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
            <span class="user-creator-tag" style="background: ${creatorTagBg}; color: ${creatorTagColor}; font-weight: 500;">${this.escapeHtml(evt.creatorName || evt.creatorUsername)} ${isOwn ? '<svg class="ui-icon" style="width:10px;height:10px;vertical-align:middle;color:#34d399"><use href="#icon-star"></use></svg>' : ''}</span>
            ${(!isLocked && !isRoomOnly && evt.price) ? `<strong style="color: #34d399; font-weight: 600;">${this.escapeHtml(evt.price)}</strong>` : ''}
            ${extraMeta}
          </div>
        `;

        card.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openEventDetailModal(evt.id);
        });

        dayCol.appendChild(card);

        // One async event is rendered in every selected hour while remaining a
        // single editable event record.
        separateHours.slice(1).forEach(asyncHour => {
          const [asyncH, asyncM] = asyncHour.split(":").map(Number);
          const asyncStart = asyncH + ((asyncM || 0) / 60);
          const clone = card.cloneNode(true);
          clone.style.top = `${(asyncStart - baseStartHour) * hourHeight}px`;
          clone.style.height = `${Math.max(32, hourHeight - 4)}px`;
          const cloneEnd = asyncStart + 1;
          clone.querySelector(".timeline-event-time").textContent = `${asyncHour} – ${String(Math.floor(cloneEnd)).padStart(2, "0")}:${String(Math.round((cloneEnd % 1) * 60)).padStart(2, "0")}`;
          clone.addEventListener("click", event => {
            event.stopPropagation();
            this.openEventDetailModal(evt.id);
          });
          dayCol.appendChild(clone);
        });
      });

      daysWrap.appendChild(dayCol);
    });

    this.dom.dailyTimelineBody.appendChild(daysWrap);
  }

  // =========================================================================
  // ZOOM LEVEL 2: MONTHLY GRID VIEW (With Click-to-Zoom into Day Timeline)
  // =========================================================================
  renderEventsGrid(filteredEvents) {
    this.dom.eventsDaysGrid.innerHTML = "";

    const firstDay = new Date(this.eventsCurrentYear, this.eventsCurrentMonth, 1);
    const lastDay = new Date(this.eventsCurrentYear, this.eventsCurrentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    const prevMonthLastDay = new Date(this.eventsCurrentYear, this.eventsCurrentMonth, 0).getDate();
    const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;

    const today = new Date();
    const realTodayStr = this.getTodayDateString();
    const isThisRealMonth = today.getFullYear() === this.eventsCurrentYear && today.getMonth() === this.eventsCurrentMonth;
    const realTodayDate = today.getDate();

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("div");
      cell.className = "calendar-day-cell";

      const dayOfWeek = i % 7;
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        cell.classList.add("weekend-cell");
      }

      let dayNumber;
      let cellDateString = "";
      let isCurrentMonthCell = true;

      if (i < startDayOfWeek) {
        dayNumber = prevMonthLastDay - (startDayOfWeek - 1 - i);
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const prevMonth = this.eventsCurrentMonth === 0 ? 11 : this.eventsCurrentMonth - 1;
        const prevYear = this.eventsCurrentMonth === 0 ? this.eventsCurrentYear - 1 : this.eventsCurrentYear;
        cellDateString = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else if (i >= startDayOfWeek + daysInMonth) {
        dayNumber = i - (startDayOfWeek + daysInMonth) + 1;
        cell.classList.add("other-month");
        isCurrentMonthCell = false;
        const nextMonth = this.eventsCurrentMonth === 11 ? 0 : this.eventsCurrentMonth + 1;
        const nextYear = this.eventsCurrentMonth === 11 ? this.eventsCurrentYear + 1 : this.eventsCurrentYear;
        cellDateString = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      } else {
        dayNumber = i - startDayOfWeek + 1;
        cellDateString = `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
        if (isThisRealMonth && dayNumber === realTodayDate) {
          cell.classList.add("is-today");
        }
      }

      const isPast = this.isPastEventDate(cellDateString);
      if (isPast) cell.classList.add("is-past");
      if (isPast && isCurrentMonthCell) {
        cell.classList.add("has-past-schedule-message");
        cell.dataset.pastScheduleMessage = this.t("event_past_create_unavailable");
      }

      // Multi-day match: event spans cellDateString
      const dayEvents = filteredEvents.filter(evt => {
        const start = evt.startDate || evt.date;
        const end = evt.endDate || evt.startDate || evt.date;
        return cellDateString >= start && cellDateString <= end;
      });

      // Day Header with Click-to-Zoom action
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.innerHTML = `
        <span class="day-number" title="Click date to zoom into Day Timeline" style="cursor: pointer;">${dayNumber}</span>
        ${isCurrentMonthCell && !isPast ? `<button class="btn-add-day" title="Schedule event for this date" data-date="${cellDateString}">+</button>` : ""}
        ${isPast && isCurrentMonthCell ? `<span class="past-schedule-message" aria-live="polite">${this.t("event_past_create_unavailable")}</span>` : ""}
      `;
      cell.appendChild(dayHeader);

      // Clicking day number or cell background zooms directly into that Day's Timeline
      cell.style.cursor = "pointer";
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".event-card-pill") || e.target.closest(".btn-add-day")) return;
        this.setEventsZoomLevel("daily", cellDateString);
      });

      const addBtn = dayHeader.querySelector(".btn-add-day");
      if (addBtn) {
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openAddEventModal(cellDateString);
        });
      }

      // Events container
      const eventsContainer = document.createElement("div");
      eventsContainer.className = "day-posts-container";

      dayEvents.forEach(event => {
        const theme = this.getEventTheme(event);
        const eventPill = document.createElement("div");
        eventPill.className = "event-card-pill";
        const isLocked = event.entryType === "locked";
        const isRoomOnly = event.entryType === "room_only";
        if (isLocked) {
          eventPill.classList.add("is-locked-pill");
        } else if (isRoomOnly) {
          eventPill.classList.add("is-room-only-pill");
        }
        eventPill.style.borderLeft = `5px solid ${theme.accent}`;
        eventPill.style.setProperty("--event-fill", this.getEventSurface(theme));
        eventPill.style.boxShadow = `0 2px 10px ${theme.glow}`;

        const durHours = event.durationHours ? `${event.durationHours}h` : "2h";
        const time = event.hour || event.time || "18:00";
        eventPill.setAttribute("aria-label", `${event.title}, ${time}, ${durHours}. Open event details.`);

        const space = event.spaceId ? (this.spaces || []).find(s => s.id === event.spaceId) : null;
        const room = event.roomId ? (this.rooms || []).find(r => r.id === event.roomId) : null;

        let tagsHtml = "";
        if (isLocked) {
          tagsHtml += `<span class="event-pill-space-tag" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">🔒 ${this.t("entry_type_locked")}</span>`;
        } else if (isRoomOnly) {
          tagsHtml += `<span class="event-pill-room-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">🛏️ ${this.t("entry_type_room_only")}</span>`;
        }
        if (space) {
          tagsHtml += `<span class="event-pill-space-tag">📍 ${this.escapeHtml(space.name)}</span>`;
        }
        if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
          const roomNames = event.roomBookings.map(b => {
            const rm = (this.rooms || []).find(r => r.id === b.roomId);
            return rm ? rm.name : b.roomId;
          }).join(", ");
          tagsHtml += `<span class="event-pill-room-tag">🛏️ ${this.escapeHtml(roomNames)}</span>`;
        } else if (room) {
          tagsHtml += `<span class="event-pill-room-tag">🛏️ ${this.escapeHtml(room.name)}</span>`;
        }

        eventPill.innerHTML = `
          <span class="event-card-time">${time} · ${durHours}</span>
          <div class="event-card-title">${isLocked ? '🔒 ' : (isRoomOnly ? '🛏️ ' : '')}${this.escapeHtml(event.title)}</div>
          ${tagsHtml ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">${tagsHtml}</div>` : ''}
        `;

        eventPill.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openEventDetailModal(event.id);
        });

        eventsContainer.appendChild(eventPill);
      });

      cell.appendChild(eventsContainer);
      this.dom.eventsDaysGrid.appendChild(cell);
    }
  }

  // =========================================================================
  // ZOOM LEVEL 3: YEARLY OVERVIEW (12 Months with Event Circle Indicators)
  // =========================================================================
  renderEventsYearlyView(filteredEvents) {
    if (!this.dom.yearlyMonthsGrid) return;
    this.dom.yearlyMonthsGrid.innerHTML = "";

    const monthNames = MONTH_NAMES[this.currentLang] || MONTH_NAMES.ro;
    const weekdaysMin = this.currentLang === "ro" ? ["L", "M", "M", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];

    const today = new Date();
    const realTodayStr = this.getTodayDateString();
    const isThisRealYear = today.getFullYear() === this.eventsCurrentYear;
    const realTodayMonth = today.getMonth();
    const realTodayDate = today.getDate();

    for (let m = 0; m < 12; m++) {
      const card = document.createElement("div");
      const isPastMonth = this.eventsCurrentYear < today.getFullYear()
        || (this.eventsCurrentYear === today.getFullYear() && m < realTodayMonth);
      card.className = `yearly-month-card ${m === this.eventsCurrentMonth ? 'current-month-card' : ''} ${isPastMonth ? 'is-past-month' : ''}`;

      // Events in this month
      const monthEvents = filteredEvents.filter(e => {
        const s = e.startDate || e.date;
        const ed = e.endDate || e.startDate || e.date;
        if (!s) return false;
        const [sy, sm] = s.split("-").map(Number);
        const [ey, em] = (ed || s).split("-").map(Number);
        const targetMonth1 = m + 1;
        return (sy === this.eventsCurrentYear && sm === targetMonth1) || (ey === this.eventsCurrentYear && em === targetMonth1);
      });

      const countBadge = monthEvents.length > 0 
        ? `<span class="yearly-month-events-badge has-events">${monthEvents.length} ${monthEvents.length === 1 ? this.t("yearly_events_count_singular") : this.t("yearly_events_count_plural")}</span>`
        : `<span class="yearly-month-events-badge">0 ${this.t("yearly_events_count_plural")}</span>`;

      card.innerHTML = `
        <div class="yearly-month-header">
          <div class="yearly-month-title">
            <svg class="ui-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg> ${monthNames[m]}
          </div>
          ${countBadge}
        </div>
        <div class="yearly-mini-calendar">
          <div class="yearly-mini-weekday">${weekdaysMin[0]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[1]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[2]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[3]}</div>
          <div class="yearly-mini-weekday">${weekdaysMin[4]}</div>
          <div class="yearly-mini-weekday" style="color: #64748b;">${weekdaysMin[5]}</div>
          <div class="yearly-mini-weekday" style="color: #64748b;">${weekdaysMin[6]}</div>
        </div>
      `;

      const miniCal = card.querySelector(".yearly-mini-calendar");

      const firstDay = new Date(this.eventsCurrentYear, m, 1);
      const daysInMonth = new Date(this.eventsCurrentYear, m + 1, 0).getDate();
      let startDayOfWeek = firstDay.getDay() - 1;
      if (startDayOfWeek < 0) startDayOfWeek = 6;

      // Empty lead-in days
      for (let pad = 0; pad < startDayOfWeek; pad++) {
        const padCell = document.createElement("div");
        padCell.className = "yearly-mini-day other-month";
        miniCal.appendChild(padCell);
      }

      // Days of this month
      for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement("div");
        dayCell.className = "yearly-mini-day";
        dayCell.textContent = d;

        const dateStr = `${this.eventsCurrentYear}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

        if (dateStr < realTodayStr) {
          dayCell.classList.add("is-past");
        }

        if (isThisRealYear && m === realTodayMonth && d === realTodayDate) {
          dayCell.classList.add("is-today");
        }

        // Find events on this day
        const dayEvts = filteredEvents.filter(e => {
          const s = e.startDate || e.date;
          const ed = e.endDate || e.startDate || e.date;
          return dateStr >= s && dateStr <= ed;
        });

        if (dayEvts.length > 0) {
          dayCell.classList.add("has-event-circle");
          const evtTitles = dayEvts.map(e => `• ${e.title} (${e.hour || e.time || '18:00'})`).join("\n");
          dayCell.title = `${dateStr}\n${evtTitles}\n(${this.t("yearly_click_to_zoom")} ${monthNames[m]})`;
          
          dayCell.addEventListener("click", (e) => {
            e.stopPropagation();
            this.eventsCurrentMonth = m;
            this.eventsActiveDate = dateStr;
            this.setEventsZoomLevel("monthly");
          });
        }

        miniCal.appendChild(dayCell);
      }

      // Clicking anywhere on the month card zooms into that month
      card.addEventListener("click", () => {
        this.eventsCurrentMonth = m;
        this.eventsActiveDate = `${this.eventsCurrentYear}-${String(m + 1).padStart(2, "0")}-15`;
        this.setEventsZoomLevel("monthly");
      });

      this.dom.yearlyMonthsGrid.appendChild(card);
    }
  }

  canEditEvent(event) {
    if (!this.currentUser) return false;
    if (this.currentUser.role === "admin") return true;
    return event.creatorId === this.currentUser.id || event.creatorUsername === this.currentUser.username;
  }

  setEventTimingMode(mode) {
    this.eventTimingMode = mode === "async" ? "async" : "consecutive";
    if (this.eventTimingMode === "consecutive") this.eventAsyncHours = [];
    this.dom.eventTimingModeInputs.forEach(input => { input.checked = input.value === this.eventTimingMode; });
    if (this.dom.eventDurationInput) this.dom.eventDurationInput.readOnly = this.eventTimingMode === "async";
    if (this.dom.eventHoursBoardHint) {
      this.dom.eventHoursBoardHint.textContent = this.eventTimingMode === "async"
        ? this.t("event_timing_async_hint")
        : this.t("event_timing_consecutive_hint");
    }
    this.updateFreeHoursBoard(this.dom.eventDateInput?.value);
  }

  updateFreeHoursBoard(dateStr) {
    if (!this.dom.eventFreeHoursBoard) return;
    this.dom.eventFreeHoursBoard.innerHTML = "";
    if (!dateStr) return;

    const excludeId = this.dom.eventEditId ? this.dom.eventEditId.value : null;

    // Find all events that overlap dateStr
    const dayEvents = this.events.filter(e => {
      if (excludeId && e.id === excludeId) return false;
      const start = e.startDate || e.date;
      const end = e.endDate || e.startDate || e.date;
      return dateStr >= start && dateStr <= end;
    });

    // Compute busy ranges. Separate-hour events reserve one hour at each selected time.
    const busyRanges = dayEvents.flatMap(e => {
      if (Array.isArray(e.scheduledHours) && e.scheduledHours.length > 1) {
        return e.scheduledHours.map(timeStr => {
          const [h, m] = timeStr.split(":").map(Number);
          const start = h + ((m || 0) / 60);
          return { start, end: start + 1, title: e.title };
        });
      }
      const timeStr = e.hour || e.time || "10:00";
      const [h, m] = timeStr.split(":").map(Number);
      const startHour = h + ((m || 0) / 60);
      const dur = parseFloat(e.durationHours) || 2;
      return { start: startHour, end: startHour + dur, title: e.title };
    });

    // 08:00 to 20:00 schedule slots
    for (let h = 8; h <= 20; h++) {
      const slotStr = `${String(h).padStart(2, "0")}:00`;
      const slotEnd = h + 1;
      const now = new Date();
      const isPastHour = dateStr === this.getTodayDateString() && h < now.getHours();

      const overlapping = busyRanges.find(r => Math.max(h, r.start) < Math.min(slotEnd, r.end));

      const chip = document.createElement("div");
      if (isPastHour) {
        chip.className = "hour-slot-chip past";
        chip.setAttribute("aria-disabled", "true");
        chip.title = this.t("event_past_create_unavailable");
        chip.innerHTML = `<span>${slotStr}</span><span class="slot-status">${this.t("event_slot_past")}</span>`;
      } else if (overlapping) {
        chip.className = "hour-slot-chip busy";
        chip.title = `Occupied by: ${overlapping.title}`;
        chip.innerHTML = `
          <span>${slotStr}</span>
          <span class="slot-status">${this.t("event_slot_busy")}</span>
        `;
      } else {
        chip.className = "hour-slot-chip free";
        chip.title = `Free slot. Click to set start hour to ${slotStr}`;
        chip.innerHTML = `
          <span>${slotStr}</span>
          <span class="slot-status">${this.t("event_slot_free")}</span>
        `;
        chip.addEventListener("click", () => {
          if (this.eventTimingMode === "async") {
            const selected = new Set(this.eventAsyncHours);
            if (selected.has(slotStr)) selected.delete(slotStr);
            else selected.add(slotStr);
            this.eventAsyncHours = [...selected].sort();
            if (this.eventAsyncHours.length) this.dom.eventHourInput.value = this.eventAsyncHours[0];
            this.dom.eventDurationInput.value = this.eventAsyncHours.length || 1;
          } else {
            this.eventAsyncHours = [];
            this.dom.eventHourInput.value = slotStr;
          }
          this.updateFreeHoursBoard(dateStr);
          this.checkEventDateConflict(this.dom.eventDateInput.value, this.dom.eventDateInput.value, this.dom.eventEditId.value);
        });
        const [selectedHour, selectedMinute] = (this.dom.eventHourInput?.value || "00:00").split(":").map(Number);
        const selectedStart = selectedHour + ((selectedMinute || 0) / 60);
        const selected = this.eventTimingMode === "async"
          ? this.eventAsyncHours.includes(slotStr)
          : h >= selectedStart && h < selectedStart + (parseFloat(this.dom.eventDurationInput?.value) || 2);
        chip.classList.toggle("is-selected", selected);
      }
      this.dom.eventFreeHoursBoard.appendChild(chip);
    }
  }

  setEventFormMode() {
    this.eventFormMode = "schedule";
    if (this.dom.eventForm) {
      this.dom.eventForm.classList.add("mode-schedule");
    }
  }

  findSmartSuggestions(startDate, startHour, durationHours, excludeEventId = null) {
    if (!this.dom.eventSmartSuggestionBox || !this.dom.smartSuggestionsList) return;
    this.dom.smartSuggestionsList.innerHTML = "";
    if (!startDate) {
      this.dom.eventSmartSuggestionBox.style.display = "none";
      return;
    }

    const dur = parseFloat(durationHours) || 2;
    const [h, m] = (startHour || "18:00").split(":").map(Number);
    const reqStart = h + ((m || 0) / 60);
    const reqEnd = reqStart + dur;

    // Check for events that overlap startDate
    const dayEvents = this.events.filter(e => {
      if (excludeEventId && e.id === excludeEventId) return false;
      const s = e.startDate || e.date;
      const ed = e.endDate || e.startDate || e.date;
      return startDate >= s && startDate <= ed;
    });

    const directConflict = dayEvents.find(e => {
      const [eh, em] = (e.hour || e.time || "10:00").split(":").map(Number);
      const eStart = eh + ((em || 0) / 60);
      const eDur = parseFloat(e.durationHours) || 2;
      const eEnd = eStart + eDur;
      return Math.max(reqStart, eStart) < Math.min(reqEnd, eEnd);
    });

    if (!directConflict && dayEvents.length === 0) {
      this.dom.eventSmartSuggestionBox.style.display = "none";
      return;
    }

    const suggestions = [];

    // SUGGESTION 1: Alternative free hour on the same day (between 08:00 and 20:00)
    for (let slotH = 8; slotH <= (20 - dur); slotH++) {
      const slotEnd = slotH + dur;
      const overlaps = dayEvents.some(e => {
        const [eh, em] = (e.hour || e.time || "10:00").split(":").map(Number);
        const eStart = eh + ((em || 0) / 60);
        const eDur = parseFloat(e.durationHours) || 2;
        const eEnd = eStart + eDur;
        return Math.max(slotH, eStart) < Math.min(slotEnd, eEnd);
      });
      if (!overlaps && Math.abs(slotH - reqStart) >= 0.5) {
        const slotStr = `${String(slotH).padStart(2, "0")}:00`;
        suggestions.push({
          type: "hour",
          label: "Free Hour Today",
          text: `Free slot today at ${slotStr} (${dur}h duration)`,
          newHour: slotStr,
          newDate: startDate
        });
        break;
      }
    }

    // SUGGESTION 2: Next completely free day (within next 30 days)
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const currDateObj = new Date(sy, sm - 1, sd);
    for (let d = 1; d <= 30; d++) {
      const nextDateObj = new Date(currDateObj.getFullYear(), currDateObj.getMonth(), currDateObj.getDate() + d);
      const nextYear = nextDateObj.getFullYear();
      const nextMonth = String(nextDateObj.getMonth() + 1).padStart(2, "0");
      const nextDay = String(nextDateObj.getDate()).padStart(2, "0");
      const nextDateStr = `${nextYear}-${nextMonth}-${nextDay}`;

      const hasAnyEvent = this.events.some(e => {
        if (excludeEventId && e.id === excludeEventId) return false;
        const s = e.startDate || e.date;
        const ed = e.endDate || e.startDate || e.date;
        return nextDateStr >= s && nextDateStr <= ed;
      });

      if (!hasAnyEvent) {
        const dayName = nextDateObj.toLocaleDateString(undefined, { weekday: "short" });
        const monthName = nextDateObj.toLocaleDateString(undefined, { month: "short" });
        const dayNum = nextDateObj.getDate();
        const prefix = d === 1 ? "Tomorrow" : `${dayName}, ${monthName} ${dayNum}`;
        suggestions.push({
          type: "next-day",
          label: "Next Free Day",
          text: `${prefix} (${nextDateStr}) is completely free`,
          newHour: startHour || "18:00",
          newDate: nextDateStr
        });
        break;
      }
    }

    // SUGGESTION 3: Same day next week (+7 days)
    const nextWeekObj = new Date(currDateObj.getFullYear(), currDateObj.getMonth(), currDateObj.getDate() + 7);
    const nwYear = nextWeekObj.getFullYear();
    const nwMonth = String(nextWeekObj.getMonth() + 1).padStart(2, "0");
    const nwDay = String(nextWeekObj.getDate()).padStart(2, "0");
    const nextWeekStr = `${nwYear}-${nwMonth}-${nwDay}`;

    const nextWeekEvents = this.events.filter(e => {
      if (excludeEventId && e.id === excludeEventId) return false;
      const s = e.startDate || e.date;
      const ed = e.endDate || e.startDate || e.date;
      return nextWeekStr >= s && nextWeekStr <= ed;
    });

    const hasConflictNextWeek = nextWeekEvents.some(e => {
      const [eh, em] = (e.hour || e.time || "10:00").split(":").map(Number);
      const eStart = eh + ((em || 0) / 60);
      const eDur = parseFloat(e.durationHours) || 2;
      const eEnd = eStart + eDur;
      return Math.max(reqStart, eStart) < Math.min(reqEnd, eEnd);
    });

    if (!hasConflictNextWeek) {
      const dayName = nextWeekObj.toLocaleDateString(undefined, { weekday: "long" });
      const monthName = nextWeekObj.toLocaleDateString(undefined, { month: "short" });
      const dayNum = nextWeekObj.getDate();
      suggestions.push({
        type: "next-week",
        label: "Same Day Next Week",
        text: `Next ${dayName}, ${monthName} ${dayNum} (${nextWeekStr}) at ${startHour || "18:00"}`,
        newHour: startHour || "18:00",
        newDate: nextWeekStr
      });
    }

    if (suggestions.length === 0 && !directConflict) {
      this.dom.eventSmartSuggestionBox.style.display = "none";
      return;
    }

    this.dom.eventSmartSuggestionBox.style.display = "block";
    if (directConflict) {
      this.dom.smartConflictDetails.innerHTML = `Conflict with <strong>"${this.escapeHtml(directConflict.title)}"</strong> booked at ${directConflict.hour || directConflict.time || "18:00"} (${directConflict.durationHours || 2}h). Choose an alternative below:`;
    } else {
      this.dom.smartConflictDetails.innerHTML = `Date has scheduled events. You may keep this or select an open recommendation below:`;
    }

    suggestions.forEach(s => {
      const card = document.createElement("div");
      card.className = "suggestion-card";
      card.innerHTML = `
        <div class="suggestion-info">
          <span class="suggestion-label label-${s.type}">${s.label}</span>
          <span>${this.escapeHtml(s.text)}</span>
        </div>
        <button type="button" class="btn-apply-suggestion">Reschedule</button>
      `;
      const applyBtn = card.querySelector(".btn-apply-suggestion");
      applyBtn.addEventListener("click", () => {
        this.applySmartSuggestion(s.newDate, s.newHour);
      });
      this.dom.smartSuggestionsList.appendChild(card);
    });
  }

  applySmartSuggestion(newDate, newHour) {
    if (newDate) {
      this.dom.eventDateInput.value = newDate;
    }
    if (newHour) {
      this.dom.eventHourInput.value = newHour;
    }
    this.updateFreeHoursBoard(newDate);
    this.checkEventDateConflict(newDate, newDate, this.dom.eventEditId.value);
    this.findSmartSuggestions(newDate, newHour, this.dom.eventDurationInput.value, this.dom.eventEditId.value);

    // Provide immediate visual confirmation
    const existingNotice = document.querySelector(".suggestion-applied-notice");
    if (existingNotice) existingNotice.remove();
    const notice = document.createElement("div");
    notice.className = "suggestion-applied-notice";
    notice.innerHTML = `<span><svg class="ui-icon" style="width:12px;height:12px;vertical-align:middle"><use href="#icon-check"></use></svg> Rescheduled to <strong>${newDate} at ${newHour}</strong>. Slot is available!</span>`;
    this.dom.eventSmartSuggestionBox.insertAdjacentElement("beforebegin", notice);
    setTimeout(() => notice.remove(), 4000);
  }

  checkEventDateConflict(startDate, endDate = null, excludeEventId = null) {
    if (!startDate || !this.dom.eventDateWarning) return;
    const end = endDate || startDate;

    const selectedAsyncHours = this.eventTimingMode === "async" ? this.eventAsyncHours : [];
    const conflicts = this.events.filter(e => {
      if (excludeEventId && e.id === excludeEventId) return false;
      const eStart = e.startDate || e.date;
      const eEnd = e.endDate || e.startDate || e.date;
      if (!(eStart <= end && eEnd >= startDate)) return false;
      if (!selectedAsyncHours.length || startDate !== end) return true;
      if (Array.isArray(e.scheduledHours) && e.scheduledHours.length > 1) {
        return selectedAsyncHours.some(selectedHour => e.scheduledHours.includes(selectedHour));
      }
      const [eventHour, eventMinute] = (e.hour || e.time || "18:00").split(":").map(Number);
      const eventStart = eventHour + ((eventMinute || 0) / 60);
      const eventEnd = eventStart + (parseFloat(e.durationHours) || 2);
      return selectedAsyncHours.some(selectedHour => {
        const [hour, minute] = selectedHour.split(":").map(Number);
        const selectedStart = hour + ((minute || 0) / 60);
        return selectedStart < eventEnd && selectedStart + 1 > eventStart;
      });
    });

    if (conflicts.length > 0) {
      this.dom.eventDateWarning.style.display = "flex";
      const list = conflicts.map(c => {
        const isMulti = c.startDate && c.endDate && c.startDate !== c.endDate;
        const span = isMulti ? `(${c.startDate} to ${c.endDate})` : `(${c.hour || c.time || '18:00'}, ${c.durationHours || 2}h)`;
        return `"${this.escapeHtml(c.title)}" ${span}`;
      }).join(", ");
      this.dom.eventDateWarningMsg.innerHTML = `Date Conflict Notice: <strong>${conflicts.length}</strong> active event(s) in this period: ${list}.`;
    } else {
      this.dom.eventDateWarning.style.display = "none";
    }
  }

  resetFacebookValidation() {
    this.isFbImageValid = false;
    if (this.dom.eventFbValidationStatus) {
      this.dom.eventFbValidationStatus.style.display = "none";
      this.dom.eventFbValidationStatus.className = "fb-dimension-status";
    }
    if (this.dom.eventFbPreviewBox) {
      this.dom.eventFbPreviewBox.style.display = "none";
    }
    if (this.dom.saveEventBtn) {
      this.dom.saveEventBtn.disabled = false;
    }
  }

  validateFacebookImage(src) {
    if (!src || !src.trim()) {
      this.resetFacebookValidation();
      return;
    }

    if (this.dom.eventFbValidationStatus) {
      this.dom.eventFbValidationStatus.style.display = "flex";
      this.dom.eventFbValidationStatus.className = "fb-dimension-status";
      this.dom.fbStatusIcon.innerHTML = '<svg class="ui-icon" style="width:14px;height:14px"><use href="#icon-clock"></use></svg>';
      this.dom.fbStatusText.textContent = "Analyzing image dimensions & Facebook 16:9 proportional standard...";
    }

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const ratio = w / h;

      // Facebook Page Cover standard: 16:9 ratio (~1.7778).
      const is16by9 = ratio >= 1.70 && ratio <= 1.85;

      if (is16by9) {
        this.isFbImageValid = true;
        if (this.dom.eventFbValidationStatus) {
          this.dom.eventFbValidationStatus.className = "fb-dimension-status valid";
          this.dom.fbStatusIcon.textContent = "Valid";
          this.dom.fbStatusText.innerHTML = `Valid Facebook Standard (16:9): <strong>${w} × ${h} px</strong> (Ratio: ${ratio.toFixed(2)}:1)`;
        }
        if (this.dom.eventFbImageData) this.dom.eventFbImageData.value = src;
        if (this.dom.eventFbPreviewImg) this.dom.eventFbPreviewImg.src = src;
        if (this.dom.fbPreviewDimsBadge) this.dom.fbPreviewDimsBadge.textContent = `${w} × ${h} (16:9)`;
        if (this.dom.eventFbPreviewBox) this.dom.eventFbPreviewBox.style.display = "block";
        if (this.dom.saveEventBtn) this.dom.saveEventBtn.disabled = false;
      } else {
        this.isFbImageValid = false;
        let shapeDesc = "non-proportional";
        if (Math.abs(ratio - 1) < 0.1) shapeDesc = "Square (1:1)";
        else if (ratio < 1) shapeDesc = "Vertical / Portrait (9:16)";
        else if (ratio > 2.0) shapeDesc = "Ultra-wide banner";
        else shapeDesc = `Aspect ratio ${ratio.toFixed(2)}:1`;

        if (this.dom.eventFbValidationStatus) {
          this.dom.eventFbValidationStatus.className = "fb-dimension-status invalid";
          this.dom.fbStatusIcon.textContent = "Invalid";
          this.dom.fbStatusText.innerHTML = `<strong>Rejected (Non-proportional):</strong> Facebook Page Cover standard strictly requires a <strong>16:9 landscape aspect ratio</strong> (e.g. 1920×1080 or 1200×675). Detected: <strong>${w} × ${h} px</strong> (${shapeDesc}).`;
        }
        if (this.dom.eventFbImageData) this.dom.eventFbImageData.value = "";
        if (this.dom.eventFbPreviewBox) this.dom.eventFbPreviewBox.style.display = "none";
        if (this.dom.saveEventBtn) this.dom.saveEventBtn.disabled = true;
      }
    };

    img.onerror = () => {
      this.isFbImageValid = false;
      if (this.dom.eventFbValidationStatus) {
        this.dom.eventFbValidationStatus.className = "fb-dimension-status invalid";
        this.dom.fbStatusIcon.textContent = "Invalid";
        this.dom.fbStatusText.textContent = "Unable to load image. Please verify file integrity or URL format.";
      }
      if (this.dom.eventFbImageData) this.dom.eventFbImageData.value = "";
      if (this.dom.eventFbPreviewBox) this.dom.eventFbPreviewBox.style.display = "none";
      if (this.dom.saveEventBtn) this.dom.saveEventBtn.disabled = true;
    };

    img.src = src;
  }

  mountEventForm(location = "dialog") {
    const target = location === "page" ? this.dom.schedulePageFormHost : this.dom.eventDialog;
    if (!target || !this.dom.eventForm || !this.dom.eventDialogFooter) return;
    if (this.dom.eventForm.parentElement !== target || this.dom.eventDialogFooter.parentElement !== target) {
      target.appendChild(this.dom.eventForm);
      target.appendChild(this.dom.eventDialogFooter);
    }

    if (this.dom.saveEventBtn) this.dom.saveEventBtn.style.display = "inline-flex";
  }

  updateMyEventsBadgeCount() {
    if (!this.currentUser) return;
    const ownEvents = (this.events || []).filter(e => e.creatorId === this.currentUser.id || e.creatorUsername === this.currentUser.username);
    const countStr = String(ownEvents.length);
    if (this.dom.navMyEventsCountBadge) {
      this.dom.navMyEventsCountBadge.textContent = countStr;
      this.dom.navMyEventsCountBadge.style.display = ownEvents.length > 0 ? "inline-flex" : "none";
    }
    if (this.dom.myEventsTotalBadge) {
      this.dom.myEventsTotalBadge.textContent = countStr;
    }
  }

  renderMyEventsPage() {
    if (!this.dom.myEventsListContainer || !this.currentUser) return;
    this.updateMyEventsBadgeCount();

    const filterRoomBtn = document.getElementById("filter-my-events-room");
    if (filterRoomBtn) {
      filterRoomBtn.style.display = this.canBookRooms() ? "inline-flex" : "none";
    }
    if (!this.canBookRooms() && this.myEventsActiveFilter === "room_only") {
      this.myEventsActiveFilter = "all";
      document.querySelectorAll("#my-events-filter-tabs .btn-filter-tab").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-filter") === "all");
      });
    }

    const activeFilter = this.myEventsActiveFilter || "all";
    const searchQuery = (this.dom.myEventsSearchInput?.value || "").trim().toLowerCase();

    // 1. Filter own events
    let ownEvents = (this.events || []).filter(event => {
      const isOwner = event.creatorId === this.currentUser.id || event.creatorUsername === this.currentUser.username;
      return isOwner;
    });

    // 2. Type filter
    if (activeFilter !== "all") {
      ownEvents = ownEvents.filter(event => {
        const type = event.entryType || (event.roomId && !event.spaceId ? "room_only" : "event");
        return type === activeFilter;
      });
    }

    // 3. Search query
    if (searchQuery) {
      ownEvents = ownEvents.filter(event => {
        const title = (event.title || "").toLowerCase();
        const desc = (event.description || "").toLowerCase();
        const space = (this.spaces || []).find(s => s.id === event.spaceId)?.name?.toLowerCase() || "";
        const rooms = (this.rooms || []).filter(r => (event.roomBookings || []).some(rb => rb.roomId === r.id) || event.roomId === r.id).map(r => r.name.toLowerCase()).join(" ");
        return title.includes(searchQuery) || desc.includes(searchQuery) || space.includes(searchQuery) || rooms.includes(searchQuery);
      });
    }

    // 4. Sort: Chronological (Upcoming first, then past)
    ownEvents.sort((a, b) => {
      const dateA = a.startDate || a.date || "";
      const dateB = b.startDate || b.date || "";
      const timeA = a.hour || a.time || "00:00";
      const timeB = b.hour || b.time || "00:00";
      return `${dateA} ${timeA}`.localeCompare(`${dateB} ${timeB}`);
    });

    this.dom.myEventsListContainer.innerHTML = "";

    if (ownEvents.length === 0) {
      const isFiltered = activeFilter !== "all" || searchQuery.length > 0;
      this.dom.myEventsListContainer.innerHTML = `
        <div class="my-events-empty-state">
          <div class="my-events-empty-icon">📅</div>
          <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">${isFiltered ? this.t("my_events_no_results") : this.t("my_events_empty_title")}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 420px; margin: 0;">${isFiltered ? "" : this.t("my_events_empty_sub")}</p>
          ${!isFiltered ? `
            <button type="button" class="btn btn-primary" id="btn-empty-create-event" style="margin-top: 8px;">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-plus"></use></svg>
              <span>${this.t("my_events_create_new")}</span>
            </button>
          ` : ""}
        </div>
      `;
      const emptyBtn = document.getElementById("btn-empty-create-event");
      if (emptyBtn) {
        emptyBtn.addEventListener("click", () => {
          this.eventsLayoutMode = "schedule";
          this.setAppView("events");
          this.openScheduleEventPage();
        });
      }
      return;
    }

    ownEvents.forEach(event => {
      const type = event.entryType || (event.roomId && !event.spaceId ? "room_only" : "event");
      let typeLabel = this.t("event_type_event");
      let typeClass = "type-event";
      if (type === "room_only") {
        typeLabel = this.t("event_type_room_only");
        typeClass = "type-room_only";
      } else if (type === "locked") {
        typeLabel = this.t("event_type_locked");
        typeClass = "type-locked";
      }

      const dateStr = event.startDate || event.date;
      const hourStr = event.hour || event.time || "18:00";
      const durationStr = event.durationHours ? `${event.durationHours}h` : "2h";
      
      const spaceObj = (this.spaces || []).find(s => s.id === event.spaceId);
      const spaceName = spaceObj ? spaceObj.name : null;

      // Accommodation room summary
      let roomsSummary = null;
      if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
        const roomNames = event.roomBookings.map(rb => {
          const rm = (this.rooms || []).find(r => r.id === rb.roomId);
          return rm ? rm.name : "Cameră";
        });
        roomsSummary = roomNames.join(", ");
      } else if (event.roomId) {
        const rm = (this.rooms || []).find(r => r.id === event.roomId);
        roomsSummary = rm ? rm.name : "Cameră";
      }

      const card = document.createElement("div");
      card.className = "my-event-card";

      card.innerHTML = `
        <div>
          <div class="my-event-card-header">
            <span class="my-event-card-type ${typeClass}">${typeLabel}</span>
            <span class="my-event-card-date">
              <svg class="ui-icon" style="width: 13px; height: 13px;" aria-hidden="true"><use href="#icon-calendar"></use></svg>
              ${dateStr} ${type !== "room_only" ? `• ${hourStr} (${durationStr})` : ""}
            </span>
          </div>

          <h3 class="my-event-card-title">${this.escapeHtml(event.title)}</h3>

          <div class="my-event-card-meta" style="margin-top: 10px;">
            ${spaceName ? `
              <div class="my-event-card-meta-item">
                <span>📍</span>
                <strong style="color: var(--text-primary);">${this.escapeHtml(spaceName)}</strong>
              </div>
            ` : ""}
            ${roomsSummary ? `
              <div class="my-event-card-meta-item">
                <svg class="ui-icon" style="width: 13px; height: 13px; color: #c084fc;" aria-hidden="true"><use href="#icon-bed"></use></svg>
                <span style="color: #c084fc; font-weight: 600;">${this.escapeHtml(roomsSummary)}</span>
              </div>
            ` : ""}
            ${type === "event" && event.price ? `
              <div class="my-event-card-meta-item">
                <span>🎟️</span>
                <span>${this.escapeHtml(this.formatEventPrice(event))}</span>
              </div>
            ` : ""}
          </div>

          ${event.description ? `
            <div class="my-event-card-desc" style="margin-top: 8px;">${this.escapeHtml(event.description)}</div>
          ` : ""}
        </div>

        <div class="my-event-card-footer">
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-secondary btn-sm btn-my-event-edit">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-sparkle"></use></svg>
              <span>${this.t("event_detail_edit_btn")}</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-my-event-view">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>
              <span>${this.t("event_detail_title")}</span>
            </button>
          </div>
          <button type="button" class="btn btn-danger btn-sm btn-my-event-delete" title="${this.t("event_detail_delete_btn")}">
            <svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      `;

      card.querySelector(".btn-my-event-edit")?.addEventListener("click", () => {
        this.openEditEventModal(event.id);
      });
      card.querySelector(".btn-my-event-view")?.addEventListener("click", () => {
        this.openEventDetailModal(event.id);
      });
      card.querySelector(".btn-my-event-delete")?.addEventListener("click", () => {
        this.currentDetailEventId = event.id;
        this.deleteCurrentDetailEvent();
      });

      this.dom.myEventsListContainer.appendChild(card);
    });
  }

  closeEventForm() {
    if (this.eventsLayoutMode === "schedule") {
      this.eventsLayoutMode = "panel";
      this.setEventsLayoutMode("panel");
      return;
    }
    this.dom.eventDialog.close();
  }

  /* ========================================================================= */
  /* Event Scheduling Adaptive Wizard Controller                              */
  /* ========================================================================= */
  updateWizardConfig() {
    const canBook = this.canBookRooms();
    let type = this.eventEntryType || "event";
    if (type === "room_only" && !canBook) {
      type = "event";
      this.eventEntryType = "event";
    }

    if (type === "locked") {
      this.wizardStepsConfig = [
        { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_locked_basics" },
        { id: "step2", paneId: "wizard-step-pane-2", labelKey: "wizard_step_locked_timing" }
      ];
    } else if (type === "room_only") {
      this.wizardStepsConfig = [
        { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_room_details" },
        { id: "step2", paneId: "wizard-step-pane-4", labelKey: "wizard_step_room_notes" }
      ];
    } else {
      // Public Event
      if (canBook) {
        this.wizardStepsConfig = [
          { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_basics" },
          { id: "step2", paneId: "wizard-step-pane-2", labelKey: "wizard_step_timing" },
          { id: "step3", paneId: "wizard-step-pane-3", labelKey: "wizard_step_accommodation" },
          { id: "step4", paneId: "wizard-step-pane-4", labelKey: "wizard_step_publishing" }
        ];
      } else {
        // Exclude Cazare step 3 completely for standard users without booking permissions
        this.wizardStepsConfig = [
          { id: "step1", paneId: "wizard-step-pane-1", labelKey: "wizard_step_basics" },
          { id: "step2", paneId: "wizard-step-pane-2", labelKey: "wizard_step_timing" },
          { id: "step4", paneId: "wizard-step-pane-4", labelKey: "wizard_step_publishing" }
        ];
      }
    }

    // Dynamic placement of Accommodation room block
    if (this.dom.eventRoomCategoryBlock) {
      if (!canBook) {
        this.dom.eventRoomCategoryBlock.style.display = "none";
      } else if (type === "event") {
        if (this.dom.wizardStep3Host && this.dom.eventRoomCategoryBlock.parentElement !== this.dom.wizardStep3Host) {
          this.dom.wizardStep3Host.appendChild(this.dom.eventRoomCategoryBlock);
        }
      } else {
        const step1Grid = document.querySelector("#wizard-step-pane-1 .form-grid");
        if (step1Grid && this.dom.eventRoomCategoryBlock.parentElement !== step1Grid) {
          step1Grid.appendChild(this.dom.eventRoomCategoryBlock);
        }
      }
    }

    this.renderWizardIndicator();
  }

  renderWizardIndicator() {
    if (!this.dom.wizardStepsIndicator) return;
    this.dom.wizardStepsIndicator.innerHTML = "";

    const totalSteps = this.wizardStepsConfig ? this.wizardStepsConfig.length : 1;
    this.wizardStepsConfig.forEach((step, idx) => {
      const stepNum = idx + 1;
      const stepItem = document.createElement("div");
      stepItem.className = `wizard-step-item ${stepNum === this.wizardCurrentStep ? "is-active" : ""} ${stepNum < this.wizardCurrentStep ? "is-completed" : ""}`;
      stepItem.setAttribute("data-step", String(stepNum));

      const badge = document.createElement("span");
      badge.className = "wizard-step-badge";
      badge.textContent = stepNum < this.wizardCurrentStep ? "✓" : String(stepNum);

      const label = document.createElement("span");
      label.className = "wizard-step-label";
      label.textContent = this.t(step.labelKey);

      stepItem.appendChild(badge);
      stepItem.appendChild(label);

      if (stepNum < this.wizardCurrentStep) {
        stepItem.style.cursor = "pointer";
        stepItem.addEventListener("click", () => {
          this.setWizardStep(stepNum);
        });
      }

      this.dom.wizardStepsIndicator.appendChild(stepItem);

      if (idx < totalSteps - 1) {
        const connector = document.createElement("span");
        connector.className = `wizard-step-connector ${stepNum < this.wizardCurrentStep ? "is-completed" : ""}`;
        this.dom.wizardStepsIndicator.appendChild(connector);
      }
    });
  }

  setWizardStep(stepNum = 1) {
    if (!this.wizardStepsConfig || this.wizardStepsConfig.length === 0) {
      this.updateWizardConfig();
    }
    const maxSteps = this.wizardStepsConfig.length;
    const targetStep = Math.max(1, Math.min(stepNum, maxSteps));
    this.wizardCurrentStep = targetStep;

    // Hide all step panes
    document.querySelectorAll(".wizard-step-pane").forEach(pane => {
      pane.classList.remove("is-active");
    });

    // Show active step pane
    const activeConfig = this.wizardStepsConfig[targetStep - 1];
    if (activeConfig) {
      const activePane = document.getElementById(activeConfig.paneId);
      if (activePane) {
        activePane.classList.add("is-active");
      }
    }

    this.renderWizardIndicator();

    // Update buttons
    const isFirstStep = targetStep === 1;
    const isLastStep = targetStep === maxSteps;

    if (this.dom.wizardPrevBtn) {
      if (isFirstStep) {
        this.dom.wizardPrevBtn.textContent = this.t("cancel");
      } else {
        this.dom.wizardPrevBtn.textContent = this.t("wizard_btn_back");
      }
    }

    if (this.dom.wizardNextBtn && this.dom.saveEventBtn) {
      if (isLastStep) {
        this.dom.wizardNextBtn.style.display = "none";
        this.dom.saveEventBtn.style.display = "inline-flex";
        const entryType = this.eventEntryType || "event";
        if (entryType === "locked") {
          this.dom.saveEventBtn.textContent = this.t("wizard_btn_save_locked");
        } else if (entryType === "room_only") {
          this.dom.saveEventBtn.textContent = this.t("wizard_btn_save_room");
        } else {
          this.dom.saveEventBtn.textContent = this.t("wizard_btn_save_event");
        }
      } else {
        this.dom.wizardNextBtn.style.display = "inline-flex";
        this.dom.wizardNextBtn.textContent = this.t("wizard_btn_next");
        this.dom.saveEventBtn.style.display = "none";
      }
    }
  }

  validateCurrentWizardStep() {
    const currentConfig = this.wizardStepsConfig?.[this.wizardCurrentStep - 1];
    if (!currentConfig) return true;

    const paneId = currentConfig.paneId;
    const type = this.eventEntryType || "event";

    if (paneId === "wizard-step-pane-1") {
      const title = this.dom.eventTitleInput?.value.trim();
      if (!title) {
        alert(this.t("wizard_val_title_req"));
        this.dom.eventTitleInput?.focus();
        return false;
      }
      if (type === "event") {
        const space = this.dom.eventSpaceSelect?.value;
        if (!space) {
          alert(this.t("wizard_val_space_req"));
          this.dom.eventSpaceSelect?.focus();
          return false;
        }
      } else if (type === "room_only") {
        if (!this.currentRoomBookings || this.currentRoomBookings.length === 0) {
          alert(this.t("wizard_val_room_req"));
          return false;
        }
        for (const booking of this.currentRoomBookings) {
          if (!booking.roomId || !booking.startDate || !booking.endDate) {
            alert(this.t("wizard_val_room_req"));
            return false;
          }
          if (booking.endDate < booking.startDate) {
            alert(this.t("alert_room_dates_invalid"));
            return false;
          }
        }
      }
    } else if (paneId === "wizard-step-pane-2") {
      const date = this.dom.eventDateInput?.value;
      if (!date) {
        alert(this.t("wizard_val_date_req"));
        this.dom.eventDateInput?.focus();
        return false;
      }
      if (!this.dom.eventEditId?.value && this.isPastEventDate(date)) {
        alert(this.t("event_past_readonly"));
        return false;
      }
    } else if (paneId === "wizard-step-pane-3") {
      if (this.dom.eventNeedsRoom?.checked) {
        if (!this.currentRoomBookings || this.currentRoomBookings.length === 0) {
          alert(this.t("wizard_val_room_req"));
          return false;
        }
        for (const booking of this.currentRoomBookings) {
          if (!booking.roomId || !booking.startDate || !booking.endDate) {
            alert(this.t("wizard_val_room_req"));
            return false;
          }
          if (booking.endDate < booking.startDate) {
            alert(this.t("alert_room_dates_invalid"));
            return false;
          }
        }
      }
    }

    return true;
  }

  nextWizardStep() {
    if (!this.validateCurrentWizardStep()) return;
    if (this.wizardCurrentStep < (this.wizardStepsConfig?.length || 1)) {
      this.setWizardStep(this.wizardCurrentStep + 1);
    }
  }

  prevWizardStep() {
    if (this.wizardCurrentStep > 1) {
      this.setWizardStep(this.wizardCurrentStep - 1);
    } else {
      this.closeEventForm();
    }
  }

  setEventEntryType(type = "event") {
    if (type === "room_only") {
      const isAllowed = this.canBookRooms();
      if (!isAllowed) {
        alert(this.t("event_room_user_blocked_msg"));
        return;
      }
    }

    this.eventEntryType = type;
    if (this.dom.eventEntryTypeInput) {
      this.dom.eventEntryTypeInput.value = type;
    }
    if (this.dom.btnEntryTypeEvent) {
      this.dom.btnEntryTypeEvent.classList.toggle("active", type === "event");
    }
    if (this.dom.btnEntryTypeLocked) {
      this.dom.btnEntryTypeLocked.classList.toggle("active", type === "locked");
    }
    if (this.dom.btnEntryTypeRoom) {
      this.dom.btnEntryTypeRoom.style.display = this.canBookRooms() ? "inline-flex" : "none";
      this.dom.btnEntryTypeRoom.classList.toggle("active", type === "room_only");
    }

    const isLocked = type === "locked";
    const isRoomOnly = type === "room_only";
    const isPublicEvent = type === "event";

    // 1. Dynamic Labels
    if (this.dom.lblEventTitle) {
      if (isRoomOnly) {
        this.dom.lblEventTitle.textContent = this.t("lbl_event_title_room");
      } else if (isLocked) {
        this.dom.lblEventTitle.textContent = this.t("lbl_event_title_locked");
      } else {
        this.dom.lblEventTitle.textContent = this.t("lbl_event_title");
      }
    }
    if (this.dom.lblEventDesc) {
      if (isRoomOnly) {
        this.dom.lblEventDesc.textContent = this.t("lbl_event_desc_room");
      } else if (isLocked) {
        this.dom.lblEventDesc.textContent = this.t("lbl_event_desc_locked");
      } else {
        this.dom.lblEventDesc.textContent = this.t("lbl_event_desc");
      }
    }

    // 2. Info Notices
    if (this.dom.eventLockedInfoNotice) {
      this.dom.eventLockedInfoNotice.style.display = isLocked ? "block" : "none";
    }
    if (this.dom.eventRoomOnlyNotice) {
      this.dom.eventRoomOnlyNotice.style.display = isRoomOnly ? "block" : "none";
    }

    // 3. Sleeping Rooms Category:
    // - Public event: optional (show checkbox header if user can book rooms, otherwise hidden)
    // - Locked: HIDDEN (blocare interval does not need cazare)
    // - Room only: ALWAYS SHOWN & EXPANDED (hide checkbox header, show booking panel directly)
    if (this.dom.eventRoomCategoryBlock) {
      if (!this.canBookRooms() || isLocked) {
        this.dom.eventRoomCategoryBlock.style.display = "none";
        if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
        if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "none";
      } else if (isRoomOnly) {
        this.dom.eventRoomCategoryBlock.style.display = "block";
        if (this.dom.eventRoomCategoryHeader) this.dom.eventRoomCategoryHeader.style.display = "none";
        if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = true;
        if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "block";
        this.handleToggleNeedsRoom(true);
      } else {
        // Public event
        this.dom.eventRoomCategoryBlock.style.display = "block";
        if (this.dom.eventRoomCategoryHeader) this.dom.eventRoomCategoryHeader.style.display = "block";
        const hasRooms = Boolean(this.currentRoomBookings && this.currentRoomBookings.length > 0);
        if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = hasRooms;
        if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = hasRooms ? "block" : "none";
      }
    }

    // 4. Event Venue / Space Selection (Required for Public, Optional/Visible for Locked, Hidden for Room Only)
    if (this.dom.eventSpaceGroup) {
      this.dom.eventSpaceGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventSpaceSelect) {
      this.dom.eventSpaceSelect.required = isPublicEvent;
    }

    // 5. Event Date, Hours & Timing Matrix (Visible for Public & Locked, Hidden for Room Only because dates are defined per room row)
    if (this.dom.eventDateGroup) {
      this.dom.eventDateGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventDateInput) {
      this.dom.eventDateInput.required = !isRoomOnly;
    }
    if (this.dom.eventHourGroup) {
      this.dom.eventHourGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventDurationGroup) {
      this.dom.eventDurationGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventTimingGroup) {
      this.dom.eventTimingGroup.style.display = isRoomOnly ? "none" : "block";
    }
    if (this.dom.eventRecurrenceGroup) {
      this.dom.eventRecurrenceGroup.style.display = isRoomOnly ? "none" : "block";
    }

    // 6. Promotional & Marketing fields (Only for Public Events)
    if (this.dom.eventPricingGroup) {
      this.dom.eventPricingGroup.style.display = isPublicEvent ? "block" : "none";
    }
    if (this.dom.eventEnrollGroup) {
      this.dom.eventEnrollGroup.style.display = isPublicEvent ? "block" : "none";
    }
    if (this.dom.eventFbCoverGroup) {
      this.dom.eventFbCoverGroup.style.display = isPublicEvent ? "block" : "none";
    }

    if (isLocked || isRoomOnly) {
      this.isFbImageValid = true;
    }

    // Update wizard structure and jump to step 1
    this.updateWizardConfig();
    this.setWizardStep(1);
  }

  populateSpaceSelect(selectedId = "") {
    if (!this.dom.eventSpaceSelect) return;
    this.dom.eventSpaceSelect.innerHTML = `<option value="">${this.t("event_space_none")}</option>`;
    (this.spaces || []).forEach(sp => {
      if (sp.enabled === false) return;
      const opt = document.createElement("option");
      opt.value = sp.id;
      opt.textContent = `${sp.name}${sp.capacity ? ` (${sp.capacity} locuri)` : ""}`;
      this.dom.eventSpaceSelect.appendChild(opt);
    });
    this.dom.eventSpaceSelect.value = selectedId || "";
  }

  handleToggleNeedsRoom(checked) {
    const isAllowed = this.currentUser && (this.currentUser.role === "admin" || this.currentUser.role === "moderator");
    if (checked && !isAllowed) {
      alert(this.t("event_room_user_blocked_msg"));
      if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
      return;
    }
    if (this.dom.eventRoomBookingPanel) {
      this.dom.eventRoomBookingPanel.style.display = checked ? "block" : "none";
    }
    if (this.dom.eventRoomCategoryBlock) {
      this.dom.eventRoomCategoryBlock.classList.toggle("is-active", checked);
    }
    if (checked && (!this.currentRoomBookings || this.currentRoomBookings.length === 0)) {
      const defDate = this.dom.eventDateInput?.value || new Date().toISOString().slice(0, 10);
      const firstRoomId = (this.rooms && this.rooms.find(r => r.enabled !== false))?.id || "";
      this.currentRoomBookings = [{ roomId: firstRoomId, startDate: defDate, endDate: defDate }];
      this.renderRoomBookingRows();
    }
  }

  renderRoomBookingRows() {
    if (!this.dom.eventRoomBookingsList) return;
    this.dom.eventRoomBookingsList.innerHTML = "";
    const availableRooms = (this.rooms || []).filter(r => r.enabled !== false);

    (this.currentRoomBookings || []).forEach((booking, idx) => {
      const row = document.createElement("div");
      row.className = "room-booking-row";
      row.innerHTML = `
        <div class="room-booking-field">
          <label>${this.t("event_room_label")}</label>
          <select class="form-select room-select" data-index="${idx}">
            <option value="">${this.t("event_room_select_placeholder")}</option>
            ${availableRooms.map(rm => `<option value="${rm.id}" ${rm.id === booking.roomId ? 'selected' : ''}>${this.escapeHtml(rm.name)} (${rm.type || 'Standard'}, ${rm.capacity || 2} locuri)</option>`).join("")}
          </select>
        </div>
        <div class="room-booking-field">
          <label>${this.t("event_room_checkin")}</label>
          <input type="date" class="form-input room-start-date" data-index="${idx}" value="${booking.startDate || ''}">
        </div>
        <div class="room-booking-field">
          <label>${this.t("event_room_checkout")}</label>
          <input type="date" class="form-input room-end-date" data-index="${idx}" value="${booking.endDate || booking.startDate || ''}">
        </div>
        <button type="button" class="btn-remove-room-booking" data-index="${idx}" title="${this.t("event_room_remove")}">
          <svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
        </button>
      `;

      row.querySelector(".room-select").addEventListener("change", (e) => {
        this.currentRoomBookings[idx].roomId = e.target.value;
      });
      row.querySelector(".room-start-date").addEventListener("change", (e) => {
        this.currentRoomBookings[idx].startDate = e.target.value;
        if (!this.currentRoomBookings[idx].endDate || this.currentRoomBookings[idx].endDate < e.target.value) {
          this.currentRoomBookings[idx].endDate = e.target.value;
          row.querySelector(".room-end-date").value = e.target.value;
        }
      });
      row.querySelector(".room-end-date").addEventListener("change", (e) => {
        this.currentRoomBookings[idx].endDate = e.target.value;
      });
      row.querySelector(".btn-remove-room-booking").addEventListener("click", () => {
        this.handleRemoveRoomBookingRow(idx);
      });

      this.dom.eventRoomBookingsList.appendChild(row);
    });
  }

  handleAddRoomBookingRow(roomId = "", startDate = "", endDate = "") {
    const isAllowed = this.currentUser && (this.currentUser.role === "admin" || this.currentUser.role === "moderator");
    if (!isAllowed) {
      alert(this.t("event_room_user_blocked_msg"));
      return;
    }
    if (!this.currentRoomBookings) this.currentRoomBookings = [];
    const defDate = startDate || this.dom.eventDateInput?.value || new Date().toISOString().slice(0, 10);
    const defRoom = roomId || (this.rooms && this.rooms.find(r => r.enabled !== false))?.id || "";
    this.currentRoomBookings.push({
      roomId: defRoom,
      startDate: defDate,
      endDate: endDate || defDate
    });
    this.renderRoomBookingRows();
  }

  handleRemoveRoomBookingRow(idx) {
    if (!this.currentRoomBookings) return;
    this.currentRoomBookings.splice(idx, 1);
    if (this.currentRoomBookings.length === 0) {
      if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
      if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "none";
      if (this.dom.eventRoomCategoryBlock) this.dom.eventRoomCategoryBlock.classList.remove("is-active");
    }
    this.renderRoomBookingRows();
  }

  checkRoomConflict(roomId, startDate, endDate, excludeEventId = null) {
    if (!roomId) return null;
    const targetStart = startDate;
    const targetEnd = endDate || startDate;

    return (this.events || []).find(e => {
      if (e.id === excludeEventId) return false;

      // Check multi-room bookings array if present
      if (Array.isArray(e.roomBookings) && e.roomBookings.length > 0) {
        const hasBookingConflict = e.roomBookings.some(rb => {
          if (rb.roomId !== roomId) return false;
          const rbStart = rb.startDate;
          const rbEnd = rb.endDate || rb.startDate;
          return targetStart <= rbEnd && targetEnd >= rbStart;
        });
        if (hasBookingConflict) return true;
      }

      // Check single roomId fallback
      if (e.roomId === roomId) {
        const eStart = e.startDate || e.date;
        const eEnd = e.endDate || e.startDate || e.date;
        return targetStart <= eEnd && targetEnd >= eStart;
      }

      return false;
    }) || null;
  }

  openScheduleEventPage() {
    if (!this.currentUser) {
      this.setAppView("login");
      return;
    }
    this.eventsLayoutMode = "schedule";
    this.setAppView("events");
    this.openAddEventModal(null, true);
  }

  openAddEventModal(preselectedDate = null, asPage = false) {
    if (!this.currentUser) {
      this.setAppView("login");
      return;
    }

    if (this.isPastEventDate(preselectedDate)) {
      alert(this.t("event_past_readonly"));
      return;
    }

    this.mountEventForm(asPage ? "page" : "dialog");

    this.dom.eventEditId.value = "";
    this.dom.eventDialogActionText.textContent = this.t("event_dialog_create_title");
    this.dom.eventForm.reset();
    this.dom.eventCreatorDisplay.value = `${this.currentUser.name} (@${this.currentUser.username})`;

    const targetDate = preselectedDate || `${this.eventsCurrentYear}-${String(this.eventsCurrentMonth + 1).padStart(2, "0")}-15`;
    this.dom.eventDateInput.value = targetDate;
    this.dom.eventHourInput.value = "18:00";
    this.dom.eventDurationInput.value = "2";
    this.eventAsyncHours = [];
    this.setEventTimingMode("consecutive");
    this.setEventEntryType("event");
    this.populateSpaceSelect("");
    
    // Reset Accommodation multi-room state
    this.currentRoomBookings = [];
    if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = false;
    if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = "none";
    if (this.dom.eventRoomCategoryBlock) this.dom.eventRoomCategoryBlock.classList.remove("is-active");

    this.dom.eventPriceInput.value = "Free";
    if (this.dom.eventPriceCurrency) this.dom.eventPriceCurrency.value = "RON";
    this.dom.eventEnrollInput.value = "";
    this.dom.eventDescInput.value = "";
    this.dom.eventFbImageFile.value = "";
    this.dom.eventFbImageUrl.value = "";
    this.dom.eventFbImageData.value = "";

    const existingNotice = document.querySelector(".suggestion-applied-notice");
    if (existingNotice) existingNotice.remove();

    if (this.dom.eventIsRecurrent) {
      this.dom.eventIsRecurrent.checked = false;
      this.dom.eventIsRecurrent.disabled = false;
    }
    if (this.dom.eventRecurrenceOptions) {
      this.dom.eventRecurrenceOptions.style.display = "none";
    }
    if (this.dom.eventRecurrenceMonths) {
      this.dom.eventRecurrenceMonths.value = "3";
      this.dom.eventRecurrenceMonths.disabled = false;
    }
    this.updateRecurrencePreviewHint("modal");

    this.setEventFormMode();
    this.resetFacebookValidation();
    this.updateFreeHoursBoard(targetDate);
    this.checkEventDateConflict(targetDate, targetDate);
    this.findSmartSuggestions(targetDate, "18:00", 2);
    if (!asPage) this.dom.eventDialog.showModal();
  }

  openEditEventModal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;

    if (!this.canEditEvent(event)) {
      alert(this.t("event_permission_denied"));
      return;
    }

    this.dom.eventEditId.value = event.id;
    this.dom.eventDialogActionText.textContent = this.t("event_dialog_edit_title");
    this.dom.eventTitleInput.value = event.title;
    this.dom.eventCreatorDisplay.value = `${event.creatorName || event.creatorUsername} (Creator)`;
    this.dom.eventDateInput.value = event.startDate || event.date;
    this.dom.eventHourInput.value = event.hour || event.time || "18:00";
    this.dom.eventDurationInput.value = event.durationHours || 2;
    this.eventAsyncHours = Array.isArray(event.scheduledHours) ? [...event.scheduledHours] : [];
    this.setEventTimingMode(this.eventAsyncHours.length > 1 ? "async" : "consecutive");
    this.setEventEntryType(event.entryType || "event");
    this.populateSpaceSelect(event.spaceId || "");

    // Load Accommodation multi-room state
    if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
      this.currentRoomBookings = event.roomBookings.map(rb => ({ ...rb }));
    } else if (event.roomId) {
      this.currentRoomBookings = [{
        roomId: event.roomId,
        startDate: event.startDate || event.date,
        endDate: event.endDate || event.startDate || event.date
      }];
    } else {
      this.currentRoomBookings = [];
    }
    const hasRooms = this.currentRoomBookings.length > 0;
    if (this.dom.eventNeedsRoom) this.dom.eventNeedsRoom.checked = hasRooms;
    if (this.dom.eventRoomBookingPanel) this.dom.eventRoomBookingPanel.style.display = hasRooms ? "block" : "none";
    if (this.dom.eventRoomCategoryBlock) this.dom.eventRoomCategoryBlock.classList.toggle("is-active", hasRooms);
    this.renderRoomBookingRows();

    this.dom.eventPriceInput.value = event.price || "";
    if (this.dom.eventPriceCurrency) this.dom.eventPriceCurrency.value = event.currency || "RON";
    this.dom.eventEnrollInput.value = event.enrollLink || "";
    this.dom.eventDescInput.value = event.description || "";
    this.dom.eventFbImageFile.value = "";
    this.dom.eventFbImageUrl.value = event.facebookImage || "";
    this.dom.eventFbImageData.value = event.facebookImage || "";

    const existingNotice = document.querySelector(".suggestion-applied-notice");
    if (existingNotice) existingNotice.remove();

    if (this.dom.eventIsRecurrent) {
      this.dom.eventIsRecurrent.checked = !!event.isRecurrent;
      this.dom.eventIsRecurrent.disabled = false;
    }
    if (this.dom.eventRecurrenceOptions) {
      this.dom.eventRecurrenceOptions.style.display = event.isRecurrent ? "block" : "none";
    }
    if (this.dom.eventRecurrenceMonths) {
      this.dom.eventRecurrenceMonths.value = String(event.recurrenceTotal || event.recurrenceMonths || 3);
      this.dom.eventRecurrenceMonths.disabled = false;
    }
    if (event.isRecurrent) {
      this.updateRecurrencePreviewHint("modal");
    }

    this.setEventFormMode();

    if (event.facebookImage) {
      this.validateFacebookImage(event.facebookImage);
    } else {
      this.resetFacebookValidation();
    }

    this.updateFreeHoursBoard(event.startDate || event.date);
    this.checkEventDateConflict(event.startDate || event.date, event.startDate || event.date, event.id);
    this.findSmartSuggestions(event.startDate || event.date, event.hour || event.time || "18:00", event.durationHours || 2, event.id);
    this.dom.eventDialog.showModal();
  }

  handleEventFormSubmit(e) {
    e.preventDefault();
    if (!this.currentUser) {
      this.openLoginDialog("events");
      return;
    }

    if (this.isDemoAccount()) {
      alert(this.t("demo_no_save_event"));
      return;
    }

    const editId = this.dom.eventEditId.value;
    const title = this.dom.eventTitleInput.value.trim();
    const entryType = this.dom.eventEntryTypeInput?.value || this.eventEntryType || "event";
    const isRoomOnly = entryType === "room_only";
    const isLocked = entryType === "locked";

    // For room_only, default date from room bookings check-in
    const startDate = this.dom.eventDateInput.value || this.currentRoomBookings?.[0]?.startDate || new Date().toISOString().slice(0, 10);
    const endDate = isRoomOnly ? (this.currentRoomBookings?.[0]?.endDate || startDate) : startDate;
    const hour = this.dom.eventHourInput.value || "18:00";
    const durationHours = parseFloat(this.dom.eventDurationInput.value) || 2;
    const spaceId = isRoomOnly ? null : (this.dom.eventSpaceSelect?.value || null);
    const price = this.dom.eventPriceInput.value.trim();
    const currency = this.dom.eventPriceCurrency?.value || "RON";
    const enrollLink = this.dom.eventEnrollInput.value.trim();
    const description = this.dom.eventDescInput.value.trim();
    const facebookImage = this.dom.eventFbImageData.value || this.dom.eventFbImageUrl.value.trim();

    if (!title || (!isRoomOnly && !startDate)) {
      alert(this.t("event_required_title_date"));
      return;
    }

    if (!editId && this.isPastEventDate(startDate)) {
      alert(this.t("event_past_readonly"));
      return;
    }

    // Role check and validation for accommodation sleeping rooms
    const needsRoom = (this.dom.eventNeedsRoom && this.dom.eventNeedsRoom.checked) || isRoomOnly;
    let roomBookings = [];
    let roomId = null;

    if (needsRoom) {
      const isAllowedToBookRooms = this.currentUser && (this.currentUser.role === "admin" || this.currentUser.role === "moderator");
      if (!isAllowedToBookRooms) {
        alert(this.t("event_room_user_blocked_msg"));
        return;
      }

      if (!this.currentRoomBookings || this.currentRoomBookings.length === 0) {
        alert(isRoomOnly ? (this.t("alert_room_required_room_only")) : (this.t("alert_room_required_event")));
        return;
      }

      for (const booking of this.currentRoomBookings) {
        if (!booking.roomId) {
          alert(this.t("alert_room_select_all"));
          return;
        }
        if (!booking.startDate || !booking.endDate) {
          alert(this.t("alert_room_dates_required"));
          return;
        }
        if (booking.endDate < booking.startDate) {
          alert(this.t("alert_room_dates_invalid"));
          return;
        }

        const roomConflict = this.checkRoomConflict(booking.roomId, booking.startDate, booking.endDate, editId);
        if (roomConflict) {
          const rm = (this.rooms || []).find(r => r.id === booking.roomId);
          alert(this.t("alert_room_conflict").replace("${room}", rm?.name || booking.roomId).replace("${event}", roomConflict.title));
          return;
        }
      }

      roomBookings = this.currentRoomBookings.map(b => ({ ...b }));
      roomId = roomBookings[0]?.roomId || null;
    }

    // Only validate FB cover image and Space for regular events (bypass for locked hours & room_only)
    if (entryType === "event") {
      if (!spaceId) {
        alert(this.t("event_space_required"));
        this.dom.eventSpaceSelect?.focus();
        return;
      }
      if (!facebookImage || !this.isFbImageValid) {
        alert(this.t("event_image_required"));
        return;
      }
    }

    const isRecurrent = this.dom.eventIsRecurrent && this.dom.eventIsRecurrent.checked;
    const recurrenceMonths = this.dom.eventRecurrenceMonths ? parseInt(this.dom.eventRecurrenceMonths.value, 10) || 3 : 3;
    const scheduledHours = this.eventTimingMode === "async" ? [...this.eventAsyncHours] : [];
    if (this.eventTimingMode === "async" && scheduledHours.length < 2) {
      alert(this.t("event_timing_async_minimum"));
      return;
    }

    const defaultSocialStatus = (isLocked || isRoomOnly) ? "none" : "pending";

    if (editId) {
      const idx = this.events.findIndex(ev => ev.id === editId);
      if (idx !== -1) {
        const existingEvent = this.events[idx];
        if (!this.canEditEvent(existingEvent)) {
          alert(this.t("alert_permission_denied"));
          return;
        }

        const relatedSeries = existingEvent.isRecurrent && existingEvent.recurrenceGroupId
          ? this.events.filter(ev => ev.recurrenceGroupId === existingEvent.recurrenceGroupId)
          : [];
        const updateEntireSeries = relatedSeries.length > 1 && confirm(
          this.t("event_series_update_prompt").replace("{count}", String(relatedSeries.length))
        );

        if (updateEntireSeries) {
          const seriesDates = isRecurrent && recurrenceMonths > 1
            ? this.computeRecurrenceDates(startDate, recurrenceMonths)
            : [startDate];
          const recurrenceGroupId = isRecurrent && seriesDates.length > 1
            ? existingEvent.recurrenceGroupId
            : null;

          this.events = this.events.filter(ev => ev.recurrenceGroupId !== existingEvent.recurrenceGroupId);
          seriesDates.forEach((recDate, recIdx) => {
            this.events.push({
              ...existingEvent,
              id: recIdx === 0 ? existingEvent.id : `evt-${Date.now()}-series-${recIdx + 1}`,
              title,
              startDate: recDate,
              endDate: recDate,
              date: recDate,
              time: hour,
              hour,
              durationHours,
              entryType,
              spaceId,
              roomId,
              roomBookings,
              price: (isLocked || isRoomOnly) ? "" : price,
              currency,
              enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
              facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
              description,
              scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
              isRecurrent: isRecurrent && seriesDates.length > 1,
              recurrenceGroupId,
              recurrenceMonths: recurrenceGroupId ? recurrenceMonths : undefined,
              recurrenceIndex: recurrenceGroupId ? recIdx + 1 : undefined,
              recurrenceTotal: recurrenceGroupId ? seriesDates.length : undefined,
              socialStatus: (isLocked || isRoomOnly) ? "none" : (existingEvent.socialStatus || "pending")
            });
          });
        } else {
          const shouldCreateSeries = isRecurrent && !existingEvent.isRecurrent && recurrenceMonths > 1;
          const isSingleSeriesEdit = isRecurrent && existingEvent.isRecurrent && !updateEntireSeries;
          const recurrenceGroupId = shouldCreateSeries ? `rec-grp-${Date.now()}` : existingEvent.recurrenceGroupId;
          const recurrenceDates = shouldCreateSeries ? this.computeRecurrenceDates(startDate, recurrenceMonths) : [startDate];

          const updatedEvent = {
            ...existingEvent,
            title,
            startDate: recurrenceDates[0],
            endDate: recurrenceDates[0],
            date: recurrenceDates[0],
            time: hour,
            hour,
            durationHours,
            entryType,
            spaceId,
            roomId,
            roomBookings,
            price: (isLocked || isRoomOnly) ? "" : price,
            currency,
            enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
            facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
            description,
            scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
            color: existingEvent.color || this.getEventTheme(existingEvent).accent,
            isRecurrent,
            recurrenceGroupId: isRecurrent ? recurrenceGroupId : null,
            recurrenceMonths: isRecurrent ? (isSingleSeriesEdit ? (existingEvent.recurrenceMonths || recurrenceMonths) : recurrenceMonths) : undefined,
            recurrenceIndex: isRecurrent ? (isSingleSeriesEdit ? (existingEvent.recurrenceIndex || 1) : 1) : undefined,
            recurrenceTotal: isRecurrent ? (isSingleSeriesEdit ? (existingEvent.recurrenceTotal || recurrenceMonths) : recurrenceDates.length) : undefined,
            socialStatus: (isLocked || isRoomOnly) ? "none" : (existingEvent.socialStatus || "pending")
          };
          this.events[idx] = updatedEvent;

          if (shouldCreateSeries) {
            recurrenceDates.slice(1).forEach((recDate, recIdx) => {
              this.events.push({
                ...updatedEvent,
                id: `evt-${Date.now()}-rec-${recIdx + 2}`,
                startDate: recDate,
                endDate: recDate,
                date: recDate,
                recurrenceIndex: recIdx + 2,
                createdAt: new Date().toISOString()
              });
            });
          }
        }
      }
    } else if (isRecurrent && recurrenceMonths > 1) {
      const recurrenceGroupId = `rec-grp-${Date.now()}`;
      const recDates = this.computeRecurrenceDates(startDate, recurrenceMonths);

      const eventTheme = this.getEventTheme({ creatorUsername: this.currentUser.username, creatorId: this.currentUser.id });
      recDates.forEach((recDateStr, idx) => {
        const newEvent = {
          id: `evt-${Date.now()}-${idx + 1}`,
          creatorId: this.currentUser.id,
          creatorUsername: this.currentUser.username,
          creatorName: this.currentUser.name,
          title,
          startDate: recDateStr,
          endDate: recDateStr,
          date: recDateStr,
          time: hour,
          hour,
          durationHours,
          entryType,
          spaceId,
          roomId,
          roomBookings,
          price: (isLocked || isRoomOnly) ? "" : price,
          currency,
          enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
          facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
          description,
          scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
          color: eventTheme.accent,
          socialStatus: defaultSocialStatus,
          promotedPostId: null,
          isRecurrent: true,
          recurrenceGroupId,
          recurrenceMonths,
          recurrenceIndex: idx + 1,
          recurrenceTotal: recDates.length,
          createdAt: new Date().toISOString()
        };
        this.events.push(newEvent);
      });
    } else {
      const eventTheme = this.getEventTheme({ creatorUsername: this.currentUser.username, creatorId: this.currentUser.id });
      const newEvent = {
        id: `evt-${Date.now()}`,
        creatorId: this.currentUser.id,
        creatorUsername: this.currentUser.username,
        creatorName: this.currentUser.name,
        title,
        startDate,
        endDate: startDate,
        date: startDate,
        time: hour,
        hour,
        durationHours,
        entryType,
        spaceId,
        roomId,
        roomBookings,
        price: (isLocked || isRoomOnly) ? "" : price,
        currency,
        enrollLink: (isLocked || isRoomOnly) ? "" : enrollLink,
        facebookImage: (isLocked || isRoomOnly) ? "" : facebookImage,
        description,
        scheduledHours: scheduledHours.length > 1 ? scheduledHours : undefined,
        color: eventTheme.accent,
        socialStatus: defaultSocialStatus,
        promotedPostId: null,
        isRecurrent: false,
        createdAt: new Date().toISOString()
      };
      this.events.push(newEvent);
    }

    this.saveEvents();
    this.updateSocialNotificationBadge();
    this.renderMyEventsPage();
    this.closeEventForm();
    this.renderEventsCalendar();
    if (this.activeApp === "admin") {
      this.renderAdminPanel();
    }
  }

  openEventDetailModal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;

    this.currentDetailEventId = eventId;
    const canModify = this.canEditEvent(event);

    const isMultiDay = event.startDate && event.endDate && event.startDate !== event.endDate;
    if (this.dom.eventDetailDaysBadge) {
      this.dom.eventDetailDaysBadge.textContent = isMultiDay ? `${this.t("event_detail_multi_day")} (${event.startDate} – ${event.endDate})` : `${this.t("event_detail_single_day")} (${event.startDate || event.date})`;
    }

    const isLocked = event.entryType === "locked";
    const isRoomOnly = event.entryType === "room_only";

    if (this.dom.eventDetailTypeBadge) {
      if (isLocked) {
        this.dom.eventDetailTypeBadge.style.display = "inline-flex";
        this.dom.eventDetailTypeBadge.textContent = `🔒 ${this.t("entry_type_locked")}`;
      } else if (isRoomOnly) {
        this.dom.eventDetailTypeBadge.style.display = "inline-flex";
        this.dom.eventDetailTypeBadge.textContent = `🛏️ ${this.t("entry_type_room_only")}`;
      } else {
        this.dom.eventDetailTypeBadge.style.display = "none";
      }
    }

    if (this.dom.eventDetailSpaceBadge) {
      if (event.spaceId) {
        const space = (this.spaces || []).find(s => s.id === event.spaceId);
        this.dom.eventDetailSpaceBadge.style.display = "inline-flex";
        this.dom.eventDetailSpaceBadge.textContent = `📍 ${space ? space.name : event.spaceId}`;
      } else {
        this.dom.eventDetailSpaceBadge.style.display = "none";
      }
    }

    if (this.dom.eventDetailRoomBadge) {
      if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
        const roomNames = event.roomBookings.map(b => {
          const rm = (this.rooms || []).find(r => r.id === b.roomId);
          return rm ? rm.name : b.roomId;
        }).join(", ");
        this.dom.eventDetailRoomBadge.style.display = "inline-flex";
        this.dom.eventDetailRoomBadge.textContent = `🛏️ ${roomNames}`;
      } else if (event.roomId) {
        const room = (this.rooms || []).find(r => r.id === event.roomId);
        this.dom.eventDetailRoomBadge.style.display = "inline-flex";
        this.dom.eventDetailRoomBadge.textContent = `🛏️ ${room ? room.name : event.roomId}`;
      } else {
        this.dom.eventDetailRoomBadge.style.display = "none";
      }
    }

    if (this.dom.eventDetailRecurrentBadge) {
      if (event.isRecurrent) {
        this.dom.eventDetailRecurrentBadge.style.display = "inline-flex";
        this.dom.eventDetailRecurrentBadge.textContent = `Recurrent (${event.recurrenceIndex || 1}/${event.recurrenceTotal || event.recurrenceMonths || 1})`;
      } else {
        this.dom.eventDetailRecurrentBadge.style.display = "none";
      }
    }

    this.dom.eventDetailCreatorPill.textContent = `${this.t("event_scheduled_by_label")}: ${event.creatorName || event.creatorUsername}`;
    this.dom.eventDetailHeading.textContent = event.title;

    const dateRangeStr = isMultiDay ? `${event.startDate} to ${event.endDate}` : `${event.startDate || event.date}`;
    const durStr = `${event.durationHours || 2} ${event.durationHours === 1 ? 'hr' : 'hrs'}`;
    this.dom.eventDetailDatetime.textContent = `${dateRangeStr} at ${event.hour || event.time || '18:00'} (${durStr})`;

    if (this.dom.eventDetailPriceItem) {
      this.dom.eventDetailPriceItem.style.display = (isLocked || isRoomOnly) ? "none" : "flex";
    }
    if (this.dom.eventDetailPrice) {
      this.dom.eventDetailPrice.textContent = this.formatEventPrice(event);
    }

    if (this.dom.eventDetailSpaceItem && this.dom.eventDetailSpaceText) {
      if (event.spaceId) {
        const space = (this.spaces || []).find(s => s.id === event.spaceId);
        this.dom.eventDetailSpaceItem.style.display = "flex";
        this.dom.eventDetailSpaceText.textContent = space ? `${space.name}${space.capacity ? ` (${space.capacity} locuri)` : ''}` : event.spaceId;
      } else {
        this.dom.eventDetailSpaceItem.style.display = "none";
      }
    }

    if (this.dom.eventDetailRoomItem && this.dom.eventDetailRoomText) {
      if (Array.isArray(event.roomBookings) && event.roomBookings.length > 0) {
        const listStr = event.roomBookings.map(b => {
          const rm = (this.rooms || []).find(r => r.id === b.roomId);
          const name = rm ? rm.name : b.roomId;
          return `${name} (${b.startDate} – ${b.endDate})`;
        }).join("; ");
        this.dom.eventDetailRoomItem.style.display = "flex";
        this.dom.eventDetailRoomText.textContent = listStr;
      } else if (event.roomId) {
        const room = (this.rooms || []).find(r => r.id === event.roomId);
        this.dom.eventDetailRoomItem.style.display = "flex";
        this.dom.eventDetailRoomText.textContent = room ? `${room.name} (${room.type || 'Cazare'})` : event.roomId;
      } else {
        this.dom.eventDetailRoomItem.style.display = "none";
      }
    }

    // Privacy protection on private/locked entries
    const canViewPrivateDesc = !isLocked || (this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator' || this.currentUser.id === event.creatorId || this.currentUser.username === event.creatorUsername));
    if (!canViewPrivateDesc) {
      this.dom.eventDetailDesc.textContent = this.t("event_private_desc_hidden");
      this.dom.eventDetailDesc.style.fontStyle = "italic";
      this.dom.eventDetailDesc.style.opacity = "0.75";
    } else {
      this.dom.eventDetailDesc.textContent = event.description || "No notes provided for this event.";
      this.dom.eventDetailDesc.style.fontStyle = "normal";
      this.dom.eventDetailDesc.style.opacity = "1";
    }

    // Facebook Page Cover presentation
    if (this.dom.eventDetailFbContainer && this.dom.eventDetailFbImage) {
      if (event.facebookImage && !isLocked && !isRoomOnly) {
        this.dom.eventDetailFbImage.src = event.facebookImage;
        this.dom.eventDetailFbContainer.style.display = "block";
      } else {
        this.dom.eventDetailFbContainer.style.display = "none";
      }
    }

    // Enrolment link button
    if (this.dom.eventDetailEnrollWrap && this.dom.eventDetailEnrollBtn) {
      if (event.enrollLink && !isLocked && !isRoomOnly) {
        this.dom.eventDetailEnrollBtn.href = event.enrollLink;
        this.dom.eventDetailEnrollWrap.style.display = "block";
      } else {
        this.dom.eventDetailEnrollWrap.style.display = "none";
      }
    }

    if (canModify) {
      this.dom.eventDetailEditBtn.style.display = "inline-flex";
      this.dom.eventDetailDeleteBtn.style.display = "inline-flex";
      this.dom.eventPermissionNotice.style.display = "none";
    } else {
      this.dom.eventDetailEditBtn.style.display = "none";
      this.dom.eventDetailDeleteBtn.style.display = "none";
      this.dom.eventPermissionNotice.style.display = "flex";
      this.dom.eventPermissionNotice.innerHTML = `<span>View only: created by <strong>${event.creatorName || event.creatorUsername}</strong>. You can only modify events you created.</span>`;
    }

    this.dom.eventDetailDialog.showModal();
  }

  deleteCurrentDetailEvent() {
    const event = this.events.find(e => e.id === this.currentDetailEventId);
    if (!event) return;

    if (!this.canEditEvent(event)) {
      alert(this.t("alert_permission_denied"));
      return;
    }

    if (event.isRecurrent && event.recurrenceGroupId) {
      const related = this.events.filter(e => e.recurrenceGroupId === event.recurrenceGroupId);
      if (related.length > 1) {
        const deleteAll = confirm(
          this.t("confirm_delete_recurring_series").replace("${title}", event.title).replace("${total}", event.recurrenceTotal).replace("${count}", related.length).replace("${date}", event.startDate || event.date)
        );
        if (deleteAll) {
          this.events = this.events.filter(e => e.recurrenceGroupId !== event.recurrenceGroupId);
        } else {
          this.events = this.events.filter(e => e.id !== event.id);
        }
        this.saveEvents();
        this.updateSocialNotificationBadge();
        this.renderMyEventsPage();
        this.dom.eventDetailDialog.close();
        this.renderEventsCalendar();
        if (this.activeApp === "admin") {
          this.renderAdminPanel();
        }
        return;
      }
    }

    if (confirm(this.t("confirm_delete_event").replace("${title}", event.title))) {
      this.events = this.events.filter(e => e.id !== event.id);
      this.saveEvents();
      this.updateSocialNotificationBadge();
      this.renderMyEventsPage();
      this.dom.eventDetailDialog.close();
      this.renderEventsCalendar();
      if (this.activeApp === "admin") {
        this.renderAdminPanel();
      }
    }
  }

  // =========================================================================
  // ADMIN PANEL LOGIC (User Provisioning & Master Events Audit)
  // =========================================================================
  setAdminCategory(category = "users") {
    this.adminActiveCategory = category;
    this.savePrefs();
    this.dom.adminCatTabs?.forEach(tab => {
      tab.classList.toggle("active", (tab.dataset.adminCat || "all") === category);
    });

    const sections = [
      { key: "users", el: this.dom.adminUsersSection },
      { key: "events", el: this.dom.adminEventsSection },
      { key: "spaces", el: this.dom.adminSpacesSection },
      { key: "rooms", el: this.dom.adminRoomsSection },
      { key: "storage", el: this.dom.adminStorageSection }
    ];

    sections.forEach(({ key, el }) => {
      if (!el) return;
      if (category === "all" || category === key) {
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    });

    if (category !== "all") {
      const targetSec = sections.find(s => s.key === category)?.el;
      if (targetSec) {
        targetSec.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  renderAdminPanel() {
    if (!this.currentUser || this.currentUser.role !== "admin") {
      this.openLoginDialog("admin");
      return;
    }

    // Top Stats & Category Filter Badges
    if (this.dom.adminUserCount) this.dom.adminUserCount.textContent = this.users.length;
    if (this.dom.adminEventCount) this.dom.adminEventCount.textContent = this.events.length;

    const countAll = document.getElementById("admin-count-all");
    if (countAll) countAll.textContent = "5";
    const countUsers = document.getElementById("admin-count-users");
    if (countUsers) countUsers.textContent = this.users.length;
    const countEvents = document.getElementById("admin-count-events");
    if (countEvents) countEvents.textContent = this.events.length;
    const countSpaces = document.getElementById("admin-count-spaces");
    if (countSpaces) countSpaces.textContent = this.spaces.length;
    const countRooms = document.getElementById("admin-count-rooms");
    if (countRooms) countRooms.textContent = this.rooms.length;
    const countStorage = document.getElementById("admin-count-storage");
    if (countStorage) countStorage.textContent = "8 GB";

    // Apply active category filter
    this.setAdminCategory(this.adminActiveCategory || "users");

    // Storage Quota & Cleanup Display
    this.updateStorageQuotaDisplay();

    // User Provisioning Table
    this.dom.adminUsersTableBody.innerHTML = "";
    this.users.forEach(user => {
      const userEventCount = this.events.filter(e => e.creatorId === user.id || e.creatorUsername === user.username).length;
      const isSelf = this.currentUser && this.currentUser.id === user.id;
      const isSystemAdmin = user.username.toLowerCase() === "admin";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
            <span class="user-avatar" aria-hidden="true"><svg class="ui-icon"><use href="#icon-user"></use></svg></span>
            <span>${this.escapeHtml(user.name)}</span>
            ${isSelf ? '<span class="badge-subtle" style="color: #38bdf8;">(You)</span>' : ''}
          </div>
        </td>
        <td><code>@${this.escapeHtml(user.username)}</code></td>
        <td>
          <span class="user-role-badge ${user.role === 'admin' ? 'role-admin' : ''}">${user.role}</span>
        </td>
        <td><strong>${userEventCount}</strong> events</td>
        <td style="color: var(--text-muted); font-size: 0.75rem;">${user.createdAt || '—'}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary btn-sm btn-edit-user" data-uid="${user.id}" title="${isSystemAdmin ? 'Change Name & Password' : 'Edit User'}">${this.t("admin_edit_btn")}</button>
            ${(isSystemAdmin || isSelf) ? '' : `<button class="btn btn-danger btn-sm btn-del-user" data-uid="${user.id}">${this.t("admin_delete_btn")}</button>`}
            ${isSystemAdmin ? '<span class="badge-subtle" style="color: #ef4444; font-size: 0.72rem; font-weight: 600;">Root Admin</span>' : ''}
          </div>
        </td>
      `;

      const editBtn = tr.querySelector(".btn-edit-user");
      if (editBtn) {
        editBtn.addEventListener("click", () => this.openEditUserModal(user.id));
      }
      const delBtn = tr.querySelector(".btn-del-user");
      if (delBtn) {
        delBtn.addEventListener("click", () => this.deleteUser(user.id));
      }

      this.dom.adminUsersTableBody.appendChild(tr);
    });

    // Master Events Table (All users)
    this.dom.adminEventsTableBody.innerHTML = "";
    const sorted = [...this.events].sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}`) - new Date(`${b.date}T${b.time || '00:00'}`));

    sorted.forEach(evt => {
      const isPromoted = evt.socialStatus === "promoted";
      const isLocked = evt.entryType === "locked";
      const isRoomOnly = evt.entryType === "room_only";
      const space = evt.spaceId ? (this.spaces || []).find(s => s.id === evt.spaceId) : null;
      let roomsBadgeHtml = "";
      if (Array.isArray(evt.roomBookings) && evt.roomBookings.length > 0) {
        roomsBadgeHtml = evt.roomBookings.map(b => {
          const rm = (this.rooms || []).find(r => r.id === b.roomId);
          return `<span class="badge-subtle" style="color: #c084fc; font-size: 0.68rem;">🛏️ ${this.escapeHtml(rm ? rm.name : b.roomId)} (${b.startDate.slice(5)} – ${b.endDate.slice(5)})</span>`;
        }).join(" ");
      } else if (evt.roomId) {
        const room = (this.rooms || []).find(r => r.id === evt.roomId);
        roomsBadgeHtml = `<span class="badge-subtle" style="color: #c084fc; font-size: 0.68rem;">🛏️ ${this.escapeHtml(room ? room.name : evt.roomId)}</span>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <strong>${evt.startDate || evt.date}</strong>
          <span style="display: block; font-size: 0.72rem; color: var(--text-muted);">${evt.hour || evt.time || '18:00'} (${evt.durationHours || 2}h)</span>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">
            ${isLocked ? '🔒 ' : (isRoomOnly ? '🛏️ ' : '')}${this.escapeHtml(evt.title)}
            ${isLocked ? `<span class="badge-subtle" style="color: #fbbf24; font-size: 0.68rem; margin-left: 4px;">${this.t("badge_locked_hours")}</span>` : ''}
            ${isRoomOnly ? `<span class="badge-subtle" style="color: #c084fc; font-size: 0.68rem; margin-left: 4px;">${this.t("badge_room_booking")}</span>` : ''}
            ${evt.isRecurrent ? `<span class="badge-subtle" style="color: #38bdf8; font-size: 0.68rem; margin-left: 4px;">Month ${evt.recurrenceIndex}/${evt.recurrenceTotal}</span>` : ''}
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px;">
            ${space ? `<span class="badge-subtle" style="color: #38bdf8; font-size: 0.68rem;">📍 ${this.escapeHtml(space.name)}</span>` : ''}
            ${roomsBadgeHtml}
            ${(evt.facebookImage && !isLocked && !isRoomOnly) ? '<span style="font-size: 0.7rem; color: var(--status-info);">16:9 cover attached</span>' : ''}
          </div>
        </td>
        <td>
          <span class="promo-status-badge ${isLocked ? 'locked' : (isRoomOnly ? 'room_only' : (isPromoted ? 'promoted' : 'pending'))}" style="${isLocked ? 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3);' : (isRoomOnly ? 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border-color: rgba(168, 85, 247, 0.3);' : '')}">
            ${isLocked ? 'Private / Locked' : (isRoomOnly ? (this.t("badge_room_booking")) : (isPromoted ? 'Promoted' : 'Awaiting promotion'))}
          </span>
        </td>
        <td>
          <span class="user-creator-tag">${this.escapeHtml(evt.creatorName || evt.creatorUsername)}</span>
        </td>
        <td style="font-size: 0.8rem;">
          <div><strong>${(isLocked || isRoomOnly) ? '-' : this.formatEventPrice(evt)}</strong></div>
          ${(!isLocked && !isRoomOnly && evt.enrollLink) ? `<a href="${evt.enrollLink}" target="_blank" style="color: var(--primary); font-size: 0.75rem; text-decoration: underline;">Enrolment Link</a>` : '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>'}
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm btn-admin-edit-evt" data-id="${evt.id}">Edit</button>
            <button class="btn btn-danger btn-sm btn-admin-del-evt" data-id="${evt.id}">Delete</button>
          </div>
        </td>
      `;

      tr.querySelector(".btn-admin-edit-evt").addEventListener("click", () => this.openEditEventModal(evt.id));
      tr.querySelector(".btn-admin-del-evt").addEventListener("click", () => this.adminDeleteEvent(evt.id));

      this.dom.adminEventsTableBody.appendChild(tr);
    });

    // Render Spaces and Rooms tables
    this.renderAdminSpaces();
    this.renderAdminRooms();
  }

  renderAdminSpaces() {
    if (!this.dom.adminSpacesTableBody) return;
    this.dom.adminSpacesTableBody.innerHTML = "";

    (this.spaces || []).forEach(space => {
      const usageCount = this.events.filter(e => e.spaceId === space.id).length;
      const isEnabled = space.enabled !== false;
      const countLabel = usageCount === 1 ? (this.t("yearly_events_count_singular")) : (this.t("yearly_events_count_plural"));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${space.color || '#38bdf8'}; flex-shrink: 0;"></span>
            <span>${this.escapeHtml(space.name)}</span>
          </div>
        </td>
        <td><strong>${space.capacity || '-'}</strong></td>
        <td><span style="color: var(--text-muted); font-size: 0.8rem;">${this.escapeHtml(space.desc || '-')}</span></td>
        <td><strong>${usageCount}</strong> <span style="font-size: 0.78rem; color: var(--text-muted);">${countLabel}</span></td>
        <td>
          <span class="user-role-badge ${isEnabled ? 'role-admin' : ''}" style="${isEnabled ? 'background: rgba(34, 197, 94, 0.15); color: #4ade80; border-color: rgba(34, 197, 94, 0.3);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
            ${isEnabled ? (this.t("cp_status_active")) : (this.t("cp_status_disabled"))}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary btn-sm btn-toggle-space" data-id="${space.id}">${isEnabled ? (this.t("btn_disable")) : (this.t("btn_enable"))}</button>
            <button class="btn btn-danger btn-sm btn-del-space" data-id="${space.id}">${this.t("admin_delete_btn")}</button>
          </div>
        </td>
      `;

      tr.querySelector(".btn-toggle-space")?.addEventListener("click", () => this.handleToggleSpace(space.id));
      tr.querySelector(".btn-del-space")?.addEventListener("click", () => this.handleDeleteSpace(space.id));

      this.dom.adminSpacesTableBody.appendChild(tr);
    });
  }

  handleCreateSpace(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const name = this.dom.newSpaceName?.value.trim();
    if (!name) return;
    const capacity = parseInt(this.dom.newSpaceCapacity?.value, 10) || null;
    const color = this.dom.newSpaceColor?.value || "#38bdf8";
    const desc = this.dom.newSpaceDesc?.value.trim() || "";

    const newSpace = {
      id: `space-${Date.now()}`,
      name,
      capacity,
      color,
      desc,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10)
    };

    if (!this.spaces) this.spaces = [];
    this.spaces.push(newSpace);
    this.saveSpaces();
    if (this.dom.createSpaceForm) this.dom.createSpaceForm.reset();
    this.renderAdminSpaces();
  }

  handleDeleteSpace(id) {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const space = (this.spaces || []).find(s => s.id === id);
    if (!space) return;
    if (confirm(this.t("confirm_delete_space").replace("${name}", space.name))) {
      this.spaces = this.spaces.filter(s => s.id !== id);
      this.saveSpaces();
      this.renderAdminSpaces();
    }
  }

  handleToggleSpace(id) {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const space = (this.spaces || []).find(s => s.id === id);
    if (!space) return;
    space.enabled = space.enabled === false ? true : false;
    this.saveSpaces();
    this.renderAdminSpaces();
  }

  renderAdminRooms() {
    if (!this.dom.adminRoomsTableBody) return;
    this.dom.adminRoomsTableBody.innerHTML = "";

    (this.rooms || []).forEach(room => {
      const usageCount = this.events.filter(e => e.roomId === room.id).length;
      const isEnabled = room.enabled !== false;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${room.color || '#a855f7'}; flex-shrink: 0;"></span>
            <span>🛏️ ${this.escapeHtml(room.name)}</span>
          </div>
        </td>
        <td><span class="badge-subtle">${this.escapeHtml(room.type || 'Standard')}</span></td>
        <td><strong>${room.capacity || 2}</strong> <span style="font-size: 0.78rem; color: var(--text-muted);">${this.currentLang === 'ro' ? 'oaspeți' : 'guests'} (${room.beds || 1} ${this.currentLang === 'ro' ? 'paturi' : 'beds'})</span></td>
        <td><span style="color: var(--text-muted); font-size: 0.8rem;">${this.escapeHtml(room.notes || '-')}</span></td>
        <td><strong>${usageCount}</strong> <span style="font-size: 0.78rem; color: var(--text-muted);">${this.t("admin_th_room_bookings")}</span></td>
        <td>
          <span class="user-role-badge ${isEnabled ? 'role-admin' : ''}" style="${isEnabled ? 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border-color: rgba(168, 85, 247, 0.3);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
            ${isEnabled ? (this.t("cp_status_active")) : (this.t("cp_status_disabled"))}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary btn-sm btn-toggle-room" data-id="${room.id}">${isEnabled ? (this.t("btn_disable")) : (this.t("btn_enable"))}</button>
            <button class="btn btn-danger btn-sm btn-del-room" data-id="${room.id}">${this.t("admin_delete_btn")}</button>
          </div>
        </td>
      `;

      tr.querySelector(".btn-toggle-room")?.addEventListener("click", () => this.handleToggleRoom(room.id));
      tr.querySelector(".btn-del-room")?.addEventListener("click", () => this.handleDeleteRoom(room.id));

      this.dom.adminRoomsTableBody.appendChild(tr);
    });
  }

  handleCreateRoom(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const name = this.dom.newRoomName?.value.trim();
    if (!name) return;
    const type = this.dom.newRoomType?.value.trim() || "Standard";
    const capacity = parseInt(this.dom.newRoomCapacity?.value, 10) || 2;
    const beds = parseInt(this.dom.newRoomBeds?.value, 10) || 1;
    const color = this.dom.newRoomColor?.value || "#a855f7";
    const notes = this.dom.newRoomNotes?.value.trim() || "";

    const newRoom = {
      id: `room-${Date.now()}`,
      name,
      type,
      capacity,
      beds,
      color,
      notes,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10)
    };

    if (!this.rooms) this.rooms = [];
    this.rooms.push(newRoom);
    this.saveRooms();
    if (this.dom.createRoomForm) this.dom.createRoomForm.reset();
    this.renderAdminRooms();
  }

  handleDeleteRoom(id) {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const room = (this.rooms || []).find(r => r.id === id);
    if (!room) return;
    if (confirm(this.t("confirm_delete_room").replace("${name}", room.name))) {
      this.rooms = this.rooms.filter(r => r.id !== id);
      this.saveRooms();
      this.renderAdminRooms();
    }
  }

  handleToggleRoom(id) {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const room = (this.rooms || []).find(r => r.id === id);
    if (!room) return;
    room.enabled = room.enabled === false ? true : false;
    this.saveRooms();
    this.renderAdminRooms();
  }

  async handleCreateUser(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const name = this.dom.newUserFullname.value.trim();
    const username = this.dom.newUserUsername.value.trim().toLowerCase();
    const password = this.dom.newUserPassword.value.trim();
    const role = this.dom.newUserRole.value;

    if (!name || !username || !password) return;

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, username, password, role })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || this.t("alert_username_taken").replace("${username}", username));
        return;
      }

      await this.fetchServerUsers();
      this.dom.createUserForm.reset();
      this.renderAdminPanel();
      alert(this.t("alert_user_created").replace("${name}", name));
    } catch (err) {
      console.error("Create user error:", err);
    }
  }

  openEditUserModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;
    const isSystemAdmin = user.username.toLowerCase() === "admin";

    this.dom.editUserId.value = user.id;
    this.dom.editUserFullname.value = user.name || "";
    this.dom.editUserUsername.value = user.username || "";
    this.dom.editUserUsername.disabled = isSystemAdmin;
    this.dom.editUserPassword.value = "";
    this.dom.editUserPassword.placeholder = isSystemAdmin ? "Enter new password (or leave empty)" : "Leave empty to keep password";
    this.dom.editUserRole.value = user.role || "user";
    this.dom.editUserRole.disabled = isSystemAdmin;

    this.dom.editUserDialog.showModal();
    setTimeout(() => {
      if (isSystemAdmin) {
        this.dom.editUserPassword.focus();
      } else {
        this.dom.editUserFullname.focus();
      }
    }, 50);
  }

  async handleEditUserSubmit(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const userId = this.dom.editUserId.value;
    const name = this.dom.editUserFullname.value.trim();
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    const isSystemAdmin = user.username.toLowerCase() === "admin";
    const username = isSystemAdmin ? "admin" : this.dom.editUserUsername.value.trim().toLowerCase();
    const password = this.dom.editUserPassword.value.trim();
    const role = isSystemAdmin ? "admin" : this.dom.editUserRole.value;

    if (!name || !username) {
      alert(this.t("alert_fill_required"));
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, username, password, role })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || this.t("alert_username_in_use").replace("${username}", username));
        return;
      }

      const oldUsername = user.username;
      // Update creator username and name on events if changed
      if (oldUsername !== username || name !== user.name) {
        this.events.forEach(evt => {
          if (evt.creatorId === userId || evt.creatorUsername === oldUsername) {
            evt.creatorUsername = username;
            evt.creatorName = name;
          }
        });
        this.saveEvents();
      }

      if (this.currentUser && this.currentUser.id === userId) {
        this.currentUser.name = name;
        this.updateUserNavDisplay();
      }

      await this.fetchServerUsers();
      this.dom.editUserDialog.close();
      this.renderAdminPanel();
      alert(this.t("alert_user_updated").replace("${name}", name));
    } catch (err) {
      console.error("Edit user error:", err);
    }
  }

  async deleteUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }

    if (user.username.toLowerCase() === "admin") {
      alert(this.t("alert_admin_no_delete"));
      return;
    }

    if (this.currentUser && this.currentUser.id === userId) {
      alert(this.t("alert_cannot_delete_self"));
      return;
    }

    if (confirm(this.t("confirm_delete_user").replace("${name}", user.name))) {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          method: "DELETE",
          credentials: "include"
        });

        const data = await res.json();
        if (!res.ok) {
          alert(data.error || (this.t("alert_delete_user_failed")));
          return;
        }

        await this.fetchServerUsers();
        this.renderAdminPanel();
      } catch (err) {
        console.error("Delete user error:", err);
      }
    }
  }

  adminDeleteEvent(eventId) {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_delete"));
      return;
    }
    const evt = this.events.find(e => e.id === eventId);
    if (!evt) return;

    if (evt.isRecurrent && evt.recurrenceGroupId) {
      const related = this.events.filter(e => e.recurrenceGroupId === evt.recurrenceGroupId);
      if (related.length > 1) {
        const deleteAll = confirm(
          this.t("confirm_admin_delete_recurring").replace("${title}", evt.title).replace("${total}", evt.recurrenceTotal)
        );
        if (deleteAll) {
          this.events = this.events.filter(e => e.recurrenceGroupId !== evt.recurrenceGroupId);
        } else {
          this.events = this.events.filter(e => e.id !== eventId);
        }
        this.saveEvents();
        this.updateSocialNotificationBadge();
        this.renderMyEventsPage();
        this.renderAdminPanel();
        if (this.activeApp === "events") {
          this.renderEventsCalendar();
        }
        return;
      }
    }

    if (confirm(this.t("confirm_admin_delete_event").replace("${title}", evt.title).replace("${creator}", evt.creatorName))) {
      this.events = this.events.filter(e => e.id !== eventId);
      this.saveEvents();
      this.updateSocialNotificationBadge();
      this.renderMyEventsPage();
      this.renderAdminPanel();
      if (this.activeApp === "events") {
        this.renderEventsCalendar();
      }
    }
  }

  // =========================================================================
  // 8 GB STORAGE QUOTA & PAST EVENTS CLEANUP METHODS
  // =========================================================================
  formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes <= 0) return "0.00 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  calculateStorageUsage() {
    let eventsBytes = 0;
    this.events.forEach(evt => {
      // Byte length of entire event record including heavy base64/URL covers
      eventsBytes += JSON.stringify(evt).length;
    });

    let postsBytes = 0;
    this.posts.forEach(post => {
      postsBytes += JSON.stringify(post).length;
    });

    const realUsedBytes = eventsBytes + postsBytes;
    const quotaBytes = this.storageQuotaBytes || DEFAULT_STORAGE_QUOTA_BYTES;

    let usedBytes = realUsedBytes;
    if (this.simulatedStorageRatio !== null && !isNaN(this.simulatedStorageRatio)) {
      usedBytes = Math.round(quotaBytes * this.simulatedStorageRatio);
    }

    const percentUsed = Math.min(100, Math.max(0, (usedBytes / quotaBytes) * 100));
    const isWarning = percentUsed >= 80 && percentUsed < 90;
    const isCritical = percentUsed >= 90;

    return {
      realUsedBytes,
      usedBytes,
      quotaBytes,
      percentUsed,
      isWarning,
      isCritical,
      eventsBytes,
      postsBytes,
      freeBytes: Math.max(0, quotaBytes - usedBytes),
      isSimulated: this.simulatedStorageRatio !== null
    };
  }

  updateStorageQuotaDisplay() {
    const stats = this.calculateStorageUsage();

    // Top nav bar warning badge
    if (this.dom.navAdminQuotaBadge) {
      if (stats.isCritical) {
        this.dom.navAdminQuotaBadge.style.display = "inline-flex";
        this.dom.navAdminQuotaBadge.textContent = "!";
        this.dom.navAdminQuotaBadge.title = `${this.t("notif_level_critical")}: ${stats.percentUsed.toFixed(1)}% / 8 GB`;
      } else if (stats.isWarning) {
        this.dom.navAdminQuotaBadge.style.display = "inline-flex";
        this.dom.navAdminQuotaBadge.textContent = "!";
        this.dom.navAdminQuotaBadge.title = `${this.t("notif_level_warning")}: ${stats.percentUsed.toFixed(1)}% / 8 GB`;
      } else {
        this.dom.navAdminQuotaBadge.style.display = "none";
      }
    }

    // Admin announcement banner
    if (this.dom.adminQuotaAlertBanner) {
      if (stats.isCritical || stats.isWarning) {
        this.dom.adminQuotaAlertBanner.style.display = "flex";
        this.dom.adminQuotaAlertBanner.className = `admin-quota-banner ${stats.isCritical ? 'danger' : 'warning'}`;
        if (this.dom.quotaBannerIcon) {
          this.dom.quotaBannerIcon.textContent = "!";
        }
        if (this.dom.quotaBannerTitle) {
          this.dom.quotaBannerTitle.textContent = this.t("admin_quota_alert_title") + ` (${stats.percentUsed.toFixed(1)}%)`;
        }
        if (this.dom.quotaBannerDesc) {
          this.dom.quotaBannerDesc.textContent = this.t("admin_quota_alert_desc");
        }
      } else {
        this.dom.adminQuotaAlertBanner.style.display = "none";
      }
    }

    // Admin Panel Section 4
    if (this.dom.adminStorageUsedText) {
      this.dom.adminStorageUsedText.textContent = this.formatBytes(stats.usedBytes);
    }
    if (this.dom.adminStorageTotalText) {
      this.dom.adminStorageTotalText.textContent = `${this.t("admin_storage_used_sub")} (${this.formatBytes(stats.quotaBytes)})${stats.isSimulated ? ' [Sim]' : ''}`;
    }
    if (this.dom.adminStoragePctBadge) {
      this.dom.adminStoragePctBadge.textContent = `${stats.percentUsed.toFixed(1)}%`;
      this.dom.adminStoragePctBadge.className = `storage-pct-badge ${stats.isCritical ? 'danger' : (stats.isWarning ? 'warning' : '')}`;
    }
    if (this.dom.adminStorageMeterFill) {
      this.dom.adminStorageMeterFill.style.width = `${stats.percentUsed}%`;
      this.dom.adminStorageMeterFill.className = `storage-meter-fill ${stats.isCritical ? 'danger' : (stats.isWarning ? 'warning' : '')}`;
    }
    if (this.dom.storageEventsSize) {
      this.dom.storageEventsSize.textContent = this.formatBytes(stats.eventsBytes);
    }
    if (this.dom.storageEventsCount) {
      this.dom.storageEventsCount.textContent = `(${this.events.length} ${this.t("yearly_events_count_plural")})`;
    }
    if (this.dom.storagePostsSize) {
      this.dom.storagePostsSize.textContent = this.formatBytes(stats.postsBytes);
    }
    if (this.dom.storagePostsCount) {
      this.dom.storagePostsCount.textContent = `(${this.posts.length} posts)`;
    }
    if (this.dom.storageFreeSize) {
      this.dom.storageFreeSize.textContent = this.formatBytes(stats.freeBytes);
    }
    if (this.dom.storageStatusSub) {
      this.dom.storageStatusSub.textContent = stats.isCritical ? this.t("notif_level_critical") : (stats.isWarning ? this.t("notif_level_warning") : this.t("admin_status_healthy"));
      this.dom.storageStatusSub.style.color = stats.isCritical ? "#f87171" : (stats.isWarning ? "#fbbf24" : "#34d399");
    }
  }

  getPastEvents(daysThreshold = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.events.filter(e => {
      const eventDateStr = e.endDate || e.startDate || e.date;
      if (!eventDateStr) return false;
      const [y, m, d] = eventDateStr.split("-").map(Number);
      const eventDate = new Date(y, m - 1, d);

      if (daysThreshold === null) {
        return eventDate < today;
      }
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysThreshold);
      cutoff.setHours(0, 0, 0, 0);
      return eventDate < cutoff;
    });
  }

  openStorageCleanupModal() {
    this.updateCleanupModalPreviews();
    if (this.dom.storageCleanupDialog) {
      this.dom.storageCleanupDialog.showModal();
    }
  }

  updateCleanupModalPreviews() {
    const stats = this.calculateStorageUsage();
    if (this.dom.cleanupModalUsageLabel) {
      this.dom.cleanupModalUsageLabel.textContent = `${this.formatBytes(stats.usedBytes)} / ${this.formatBytes(stats.quotaBytes)} (${stats.percentUsed.toFixed(1)}%)`;
    }
    if (this.dom.cleanupModalMeterFill) {
      this.dom.cleanupModalMeterFill.style.width = `${stats.percentUsed}%`;
      this.dom.cleanupModalMeterFill.className = `storage-meter-fill ${stats.isCritical ? 'danger' : (stats.isWarning ? 'warning' : '')}`;
    }

    // Filter preview for Past Events
    const filterVal = this.dom.cleanupEventAgeSelect ? this.dom.cleanupEventAgeSelect.value : "all-past";
    const days = filterVal === "all-past" ? null : parseInt(filterVal, 10);
    const pastEvents = this.getPastEvents(days);

    let estimatedBytes = 0;
    pastEvents.forEach(e => {
      estimatedBytes += JSON.stringify(e).length;
    });

    if (this.dom.cleanupPreviewEvents) {
      this.dom.cleanupPreviewEvents.textContent = `Matches: ${pastEvents.length} past event(s) (Est. ~${this.formatBytes(estimatedBytes)} to free)`;
    }

    // Strip images preview
    const pastEventsWithImage = this.getPastEvents(null).filter(e => !!e.facebookImage);
    let stripBytes = 0;
    pastEventsWithImage.forEach(e => {
      stripBytes += (e.facebookImage || "").length;
    });

    if (this.dom.cleanupStripPreview) {
      this.dom.cleanupStripPreview.textContent = `${pastEventsWithImage.length} past event(s) holding images (~${this.formatBytes(stripBytes)})`;
    }

    // Social media purge preview
    const todayStr = new Date().toISOString().slice(0, 10);
    const oldPublishedPosts = this.posts.filter(p => p.status === "published" && p.date < todayStr && p.mediaUrl);
    if (this.dom.cleanupSocialPreview) {
      this.dom.cleanupSocialPreview.textContent = `${oldPublishedPosts.length} published post(s) with media`;
    }
  }

  executeCleanupPastEvents() {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_cleanup"));
      return;
    }
    const filterVal = this.dom.cleanupEventAgeSelect ? this.dom.cleanupEventAgeSelect.value : "all-past";
    const days = filterVal === "all-past" ? null : parseInt(filterVal, 10);
    const toDelete = this.getPastEvents(days);

    if (toDelete.length === 0) {
      alert(this.t("alert_no_past_events"));
      return;
    }

    const desc = filterVal === "all-past" ? "all past events prior to today" : `events older than ${days} days`;
    if (!confirm(this.t("confirm_cleanup_delete").replace("${count}", toDelete.length).replace("${desc}", desc))) {
      return;
    }

    const idsToDelete = new Set(toDelete.map(e => e.id));
    this.events = this.events.filter(e => !idsToDelete.has(e.id));
    this.saveEvents();

    if (this.simulatedStorageRatio !== null) {
      this.saveSimulatedStorage(null);
    }

    this.updateCleanupModalPreviews();
    this.updateStorageQuotaDisplay();
    this.renderAdminPanel();
    this.renderEventsCalendar();
    this.updateSocialNotificationBadge();

    alert(this.t("alert_events_deleted").replace("${count}", toDelete.length));
  }

  executeStripPastImages() {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_cleanup"));
      return;
    }
    const pastEventsWithImage = this.getPastEvents(null).filter(e => !!e.facebookImage);
    if (pastEventsWithImage.length === 0) {
      alert(this.t("alert_no_images_strip"));
      return;
    }

    if (!confirm(this.t("confirm_cleanup_strip").replace("${count}", pastEventsWithImage.length))) {
      return;
    }

    pastEventsWithImage.forEach(e => {
      e.facebookImage = null;
    });
    this.saveEvents();

    if (this.simulatedStorageRatio !== null) {
      this.saveSimulatedStorage(null);
    }

    this.updateCleanupModalPreviews();
    this.updateStorageQuotaDisplay();
    this.renderAdminPanel();
    this.renderEventsCalendar();

    alert(this.t("alert_images_stripped").replace("${count}", pastEventsWithImage.length));
  }

  executeCleanupSocialMedia() {
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_cleanup"));
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const oldPublishedPosts = this.posts.filter(p => p.status === "published" && p.date < todayStr && p.mediaUrl);
    if (oldPublishedPosts.length === 0) {
      alert(this.t("alert_no_media_purge"));
      return;
    }

    if (!confirm(this.t("confirm_cleanup_purge").replace("${count}", oldPublishedPosts.length))) {
      return;
    }

    oldPublishedPosts.forEach(p => {
      p.mediaUrl = null;
    });
    this.savePosts();

    if (this.simulatedStorageRatio !== null) {
      this.saveSimulatedStorage(null);
    }

    this.updateCleanupModalPreviews();
    this.updateStorageQuotaDisplay();
    this.render();

    alert(this.t("alert_media_purged").replace("${count}", oldPublishedPosts.length));
  }

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Initialize Application once DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.calendarApp = new SocialCalendarApp();
});
