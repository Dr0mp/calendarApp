// Social Calendar & Workspace Suite — application entry point.
// The class holds state (constructor); behaviour lives in feature mixins under src/.
import { storageMethods } from "./core/storage.js";
import { i18nMethods } from "./core/i18n.js";
import { domRefsMethods } from "./core/dom-refs.js";
import { bindMethods } from "./core/bind.js";
import { routerMethods } from "./core/router.js";
import { utilMethods } from "./core/utils.js";
import { feedbackMethods } from "./core/feedback.js";
import { authMethods } from "./auth.js";
import { passkeyMethods } from "./passkeys.js";
import { socialCalendarMethods } from "./social/calendar.js";
import { postEditorMethods } from "./social/post-editor.js";
import { controlPanelMethods } from "./social/control-panel.js";
import { notificationMethods } from "./social/notifications.js";
import { eventModelMethods } from "./events/model.js";
import { eventViewMethods } from "./events/views.js";
import { eventFormMethods } from "./events/event-form.js";
import { wizardMethods } from "./events/wizard.js";
import { myEventsMethods } from "./events/my-events.js";
import { adminPanelMethods } from "./admin/panel.js";
import { adminUserMethods } from "./admin/users.js";
import { adminVenueMethods } from "./admin/venues.js";
import { storageQuotaMethods } from "./admin/storage-quota.js";

class SocialCalendarApp {
  constructor() {
    this.cleanupLegacyStorage();

    // Workspace data comes from the server after sign-in (loadWorkspace); empty until then.
    this.resetWorkspaceState();
    this.users = []; // filled from the server by fetchServerUsers()
    // The server session (httpOnly cookie) is the only source of truth: initServerAuth() decides the view.
    this.currentUser = null;
    this.eventEntryType = "event"; // 'event' | 'locked'
    this.adminActiveCategory = "users"; // 'users' | 'events' | 'spaces' | 'rooms' | 'storage' | 'all'

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
}

const MIXINS = [
  storageMethods,
  i18nMethods,
  domRefsMethods,
  bindMethods,
  routerMethods,
  utilMethods,
  feedbackMethods,
  authMethods,
  passkeyMethods,
  socialCalendarMethods,
  postEditorMethods,
  controlPanelMethods,
  notificationMethods,
  eventModelMethods,
  eventViewMethods,
  eventFormMethods,
  wizardMethods,
  myEventsMethods,
  adminPanelMethods,
  adminUserMethods,
  adminVenueMethods,
  storageQuotaMethods
];

// Guard against two modules defining the same method (a later one would silently win).
const seen = new Map();
for (const mixin of MIXINS) {
  for (const name of Object.keys(mixin)) {
    if (seen.has(name) || name in SocialCalendarApp.prototype) throw new Error(`Duplicate app method "${name}"`);
    seen.set(name, mixin);
  }
  Object.assign(SocialCalendarApp.prototype, mixin);
}

// Initialize Application once DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.calendarApp = new SocialCalendarApp();
});
