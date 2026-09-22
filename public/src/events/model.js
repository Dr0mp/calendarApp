// Event queries, colours and permissions.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.
import { WEEKDAY_NAMES } from "../data/i18n.js";

export const eventModelMethods = {
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
  },
  getEventSurface(theme) {
    if (this.theme !== "light") return theme.gradient;
    return `linear-gradient(135deg, ${this.hexToRgba(theme.accent, 0.14)} 0%, ${this.hexToRgba(theme.accent, 0.045)} 100%)`;
  },
  isPastEventDate(dateStr) {
    return Boolean(dateStr) && dateStr < this.getTodayDateString();
  },
  formatEventPrice(event) {
    if (!event?.price || String(event.price).trim().toLowerCase() === "free") return this.t("event_free");
    return `${event.price} ${event.currency || "RON"}`;
  },
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
  },
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
  },
  canEditEvent(event) {
    if (!this.currentUser) return false;
    if (this.currentUser.role === "admin") return true;
    return event.creatorId === this.currentUser.id || event.creatorUsername === this.currentUser.username;
  }
};
