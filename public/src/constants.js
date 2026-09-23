// Storage keys, limits and shared helpers.
// Storage Keys
export const STORAGE_PREFS_KEY = "social_cal_prefs_2026_v1";
export const STORAGE_LANG_KEY = "cal_suite_lang_v1";
export const STORAGE_THEME_KEY = "cal_suite_theme_v1";
export const STORAGE_ACTIVE_APP_KEY = "cal_suite_active_app_v1";
export const STORAGE_STORAGE_SIM_KEY = "cal_suite_storage_sim_v1";

// Storage/parse failures used to be swallowed silently; keep them visible in the console.
export function warnStorage(error) {
  console.warn("[storage]", error);
}

