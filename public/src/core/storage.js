// Browser storage (localStorage) for platforms, posts, spaces, rooms, events and preferences.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { DEFAULT_PLATFORMS, DEFAULT_ROOMS, DEFAULT_SPACES, INITIAL_EVENTS, INITIAL_POSTS } from "../data/seed-data.js";
import { STORAGE_EVENTS_KEY, STORAGE_PLATFORMS_KEY, STORAGE_POSTS_KEY, STORAGE_PREFS_KEY, STORAGE_ROOMS_KEY, STORAGE_SPACES_KEY, STORAGE_STORAGE_SIM_KEY, warnStorage } from "../constants.js";

export const storageMethods = {
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
  },
  savePlatforms() {
    try {
      localStorage.setItem(STORAGE_PLATFORMS_KEY, JSON.stringify(this.platforms));
    } catch (e) {
      console.error("Error saving platforms", e);
    }
  },
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
  },
  savePosts() {
    try {
      localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(this.posts));
    } catch (e) {
      console.error("Error saving posts", e);
    }
  },
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
  },
  saveSpaces() {
    try {
      localStorage.setItem(STORAGE_SPACES_KEY, JSON.stringify(this.spaces));
    } catch (e) { warnStorage(e); }
  },
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
  },
  saveRooms() {
    try {
      localStorage.setItem(STORAGE_ROOMS_KEY, JSON.stringify(this.rooms));
    } catch (e) { warnStorage(e); }
  },
  // Events Storage
  loadEvents() {
    try {
      const stored = localStorage.getItem(STORAGE_EVENTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) { warnStorage(e); }
    return JSON.parse(JSON.stringify(INITIAL_EVENTS));
  },
  saveEvents() {
    try {
      localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(this.events));
    } catch (e) { warnStorage(e); }
    this.updateStorageQuotaDisplay();
    this.updateMyEventsBadgeCount();
    if (this.activeApp === "events" && this.eventsLayoutMode === "my-events") {
      this.renderMyEventsPage();
    }
  },
  loadSimulatedStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_STORAGE_SIM_KEY);
      return stored !== null ? parseFloat(stored) : null;
    } catch (e) {
      return null;
    }
  },
  saveSimulatedStorage(ratio) {
    try {
      if (ratio === null) {
        localStorage.removeItem(STORAGE_STORAGE_SIM_KEY);
      } else {
        localStorage.setItem(STORAGE_STORAGE_SIM_KEY, String(ratio));
      }
    } catch (e) { warnStorage(e); }
    this.simulatedStorageRatio = ratio;
  },
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
  },
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
  },
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
};
