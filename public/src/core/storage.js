// Workspace data (platforms, posts, events, spaces, rooms) lives on the server (/api/data).
// Each saveX() sends only what changed since the last sync; the server checks permissions.
// Only per-browser preferences (language, theme, view state) stay in localStorage.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { DEFAULT_PLATFORMS } from "../data/seed-data.js";
import { STORAGE_PREFS_KEY, STORAGE_STORAGE_SIM_KEY, warnStorage } from "../constants.js";
import { apiRequest } from "./utils.js";

const COLLECTIONS = ["platforms", "posts", "events", "spaces", "rooms"];
// Collections whose order is meaningful (shown in the order the admin arranged them).
const ORDERED = new Set(["platforms", "spaces", "rooms"]);

// Events saved by older builds carried duplicate fields (date = startDate, time = hour).
// Canonical fields: startDate, endDate, hour. Returns the same object when nothing changes.
export function normalizeEvent(event) {
  if (!event || (!("date" in event) && !("time" in event))) return event;
  const { date, time, ...rest } = event;
  rest.startDate = rest.startDate || date;
  rest.endDate = rest.endDate || rest.startDate;
  rest.hour = rest.hour || time;
  return rest;
}

// Platform icons/domains are part of the app, not the data: fill them in when missing.
function withPlatformDefaults(list) {
  return list.map(p => {
    const def = DEFAULT_PLATFORMS.find(d => d.id === p.id);
    if (def) {
      if (!p.iconUrl) p.iconUrl = def.iconUrl;
      if (!p.domain) p.domain = def.domain;
    }
    if (p.enabled === undefined) p.enabled = true;
    return p;
  });
}

export const storageMethods = {
  // Empty workspace until someone signs in.
  resetWorkspaceState() {
    this.platforms = [];
    this.posts = [];
    this.events = [];
    this.spaces = [];
    this.rooms = [];
    this.storageStats = null;
    this.syncedState = null;
    this.syncQueue = Promise.resolve();
  },
  // Loads the signed-in user's workspace (the demo workspace for demo accounts).
  async loadWorkspace() {
    const { res, data } = await apiRequest("GET", "/api/data");
    if (!res.ok) throw new Error(`Loading data failed (${res.status})`);
    this.platforms = withPlatformDefaults(data.platforms || []);
    this.posts = data.posts || [];
    this.events = (data.events || []).map(normalizeEvent);
    this.spaces = data.spaces || [];
    this.rooms = data.rooms || [];
    this.storageStats = data.storage || null;
    this.lastWorkspaceLoad = Date.now();
    this.syncedState = {};
    COLLECTIONS.forEach(c => this.rememberSynced(c));
    this.loadPrefs(); // re-check the saved platform filter against the loaded platforms
  },
  // Coming back to the tab picks up changes other people saved meanwhile (at most every 30 s).
  bindWorkspaceRefresh() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !this.currentUser) return;
      if (Date.now() - (this.lastWorkspaceLoad || 0) < 30000) return;
      this.lastWorkspaceLoad = Date.now();
      this.syncQueue
        .then(() => this.loadWorkspace())
        .then(() => this.refreshAfterDataReload())
        .catch(err => console.warn("Workspace refresh failed:", err));
    });
  },
  rememberSynced(collection) {
    this.syncedState[collection] = new Map(this[collection].map(item => [item.id, JSON.stringify(item)]));
  },
  // Sends the difference between this[collection] and the last synced state.
  saveCollection(collection) {
    const prev = this.syncedState?.[collection];
    if (!prev || !this.currentUser) return Promise.resolve();
    const current = new Map();
    const upserts = [];
    for (const item of this[collection]) {
      const json = JSON.stringify(item);
      current.set(item.id, json);
      if (prev.get(item.id) !== json) upserts.push(item);
    }
    const deletes = [...prev.keys()].filter(id => !current.has(id));
    const ids = [...current.keys()];
    const orderChanged = ORDERED.has(collection) && ids.join("\n") !== [...prev.keys()].join("\n");
    if (!upserts.length && !deletes.length && !orderChanged) return Promise.resolve();
    this.syncedState[collection] = current;
    const body = { upserts, deletes };
    if (orderChanged) body.order = ids;
    this.syncQueue = this.syncQueue
      .then(() => apiRequest("POST", `/api/data/${collection}/sync`, body))
      .then(({ res, data }) => {
        if (res.ok) {
          this.storageStats = data.storage || this.storageStats;
          this.updateStorageQuotaDisplay();
          return;
        }
        return this.handleSyncFailure(data?.code);
      })
      .catch(err => {
        console.warn("Sync failed:", err);
        return this.handleSyncFailure("network");
      });
    return this.syncQueue;
  },
  // The server refused a change (permissions, storage full) or was unreachable:
  // tell the user and reload the server's version so the screen matches what is saved.
  async handleSyncFailure(code) {
    const known = { storage_full: "sync_error_storage_full", admin_only: "alert_permission_denied", not_your_event: "alert_permission_denied", rooms_staff_only: "event_room_user_blocked_msg" };
    this.notify(this.t(known[code] || "sync_error_generic"), "danger");
    try {
      await this.loadWorkspace();
      this.refreshAfterDataReload();
    } catch (err) {
      console.warn("Reload after failed sync failed:", err);
    }
  },
  // Re-renders whatever is on screen after the data changed underneath it.
  refreshAfterDataReload() {
    this.updateStorageQuotaDisplay();
    if (this.activeApp === "social") this.render();
    else if (this.activeApp === "admin") this.renderAdminPanel();
    else if (this.activeApp === "events" && this.eventsLayoutMode !== "schedule") this.setEventsLayoutMode(this.eventsLayoutMode);
  },
  // Uploads a picked file; resolves to its URL on this server.
  async uploadMedia(file) {
    const res = await fetch("/api/uploads", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const key = { storage_full: "sync_error_storage_full", unsupported_media: "upload_error_type" }[data.code] || (res.status === 413 ? "upload_error_too_large" : "upload_error_generic");
      throw Object.assign(new Error(data.code || "upload_failed"), { messageKey: key });
    }
    if (data.storage) this.storageStats = data.storage;
    return data.url;
  },
  savePlatforms() {
    return this.saveCollection("platforms");
  },
  savePosts() {
    return this.saveCollection("posts");
  },
  saveSpaces() {
    return this.saveCollection("spaces");
  },
  saveRooms() {
    return this.saveCollection("rooms");
  },
  saveEvents() {
    const done = this.saveCollection("events");
    this.updateStorageQuotaDisplay();
    this.updateMyEventsBadgeCount();
    if (this.activeApp === "events" && this.eventsLayoutMode === "my-events") {
      this.renderMyEventsPage();
    }
    return done;
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
  // One-time removal of localStorage keys written by earlier builds.
  cleanupLegacyStorage() {
    const SCHEMA_KEY = "cal_suite_schema";
    const SCHEMA_VERSION = 4;
    try {
      if (Number(localStorage.getItem(SCHEMA_KEY)) >= SCHEMA_VERSION) return;
      [
        "cal_suite_auth_session_v1", "cal_suite_users_v1", "cal_suite_spaces_v1", "cal_suite_rooms_v1",
        // v4: workspace data moved to the server
        "social_cal_platforms_2026_v1", "social_cal_posts_2026_v1", "cal_suite_events_v1", "cal_suite_spaces_v2", "cal_suite_rooms_v2"
      ].forEach(k => localStorage.removeItem(k));
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
