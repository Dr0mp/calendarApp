// Small helpers shared by every feature.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

// JSON call to the app's own API (session cookie included). Resolves to { res, data }.
export async function apiRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty or non-JSON body */ }
  return { res, data };
}

export const utilMethods = {
  // Weekday initials row for the year-overview mini calendars (Sat/Sun muted).
  renderMiniWeekdayRow(weekdaysMin) {
    return weekdaysMin.map((d, i) => `<div class="yearly-mini-weekday"${i >= 5 ? ' style="color: #64748b;"' : ""}>${d}</div>`).join("\n");
  },
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
  },
  // File Share & Clipboard Helpers
  copyToClipboard(text, btnElement = null) {
    if (!text) return;
    const onSuccess = () => {
      if (btnElement) {
        const origText = btnElement.innerHTML;
        btnElement.innerHTML = '<svg class="ui-icon u-w-12 u-h-12 u-valign-middle"><use href="#icon-check"></use></svg> ' + this.t("copied_label");
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
  },
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
  },
  getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  },
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
  },
  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};
