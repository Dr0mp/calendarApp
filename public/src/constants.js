// Storage keys, limits and shared helpers.
// Storage Keys
export const STORAGE_PLATFORMS_KEY = "social_cal_platforms_2026_v1";
export const STORAGE_POSTS_KEY = "social_cal_posts_2026_v1";
export const STORAGE_PREFS_KEY = "social_cal_prefs_2026_v1";
export const STORAGE_LANG_KEY = "cal_suite_lang_v1";
export const STORAGE_THEME_KEY = "cal_suite_theme_v1";
export const STORAGE_EVENTS_KEY = "cal_suite_events_v1";
export const STORAGE_SPACES_KEY = "cal_suite_spaces_v2";
export const STORAGE_ROOMS_KEY = "cal_suite_rooms_v2";
export const STORAGE_ACTIVE_APP_KEY = "cal_suite_active_app_v1";
export const STORAGE_STORAGE_SIM_KEY = "cal_suite_storage_sim_v1";

// Storage/parse failures used to be swallowed silently; keep them visible in the console.
export function warnStorage(error) {
  console.warn("[storage]", error);
}

export const DEFAULT_STORAGE_QUOTA_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB
