// One-off, mechanical split of public/app.js into mixin modules under public/src/.
// Method bodies are copied verbatim (with their leading comments); nothing is rewritten.
const fs = require('fs'), path = require('path');
const acorn = require('../audit/node_modules/acorn'), walk = require('../audit/node_modules/acorn-walk');
const PUB = path.resolve(__dirname, '../../public');
const js = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

const MODULES = {
  'core/storage.js': ['storageMethods', 'Browser storage (localStorage) for platforms, posts, spaces, rooms, events and preferences', 'loadPlatforms savePlatforms loadPosts savePosts loadSpaces saveSpaces loadRooms saveRooms loadEvents saveEvents loadSimulatedStorage saveSimulatedStorage cleanupLegacyStorage loadPrefs savePrefs'],
  'core/i18n.js': ['i18nMethods', 'Language and theme: t(), applyLanguage(), theme switching', 'loadLanguage saveLanguage loadTheme applyTheme toggleTheme t setLanguage applyLanguage'],
  'core/dom-refs.js': ['domRefsMethods', 'Cached element references (this.dom)', 'initElements'],
  'core/bind.js': ['bindMethods', 'Event listener wiring', 'bindEvents'],
  'core/router.js': ['routerMethods', 'Top-level view switching and the navigation bar', 'setAppView updateUserNavDisplay'],
  'core/utils.js': ['utilMethods', 'Small helpers shared by every feature', 'escapeHtml hexToRgba formatBytes copyToClipboard fallbackCopy getTodayDateString'],
  'auth.js': ['authMethods', 'Server session, login/logout, user list', 'isDemoAccount canBookRooms initServerAuth resolveServerSession fetchServerUsers handleDirectLoginSubmit openLoginDialog handleLoginSubmit handleLogout'],
  'social/calendar.js': ['socialCalendarMethods', 'Social calendar: platform filter, month/year/feed views', 'getPlatform getPlatformIcon getPostType changeMonth setViewMode syncSocialViewMode getFilteredPosts render renderPlatformFilterBar renderCalendarGrid renderSocialYearView renderFeedView'],
  'social/post-editor.js': ['postEditorMethods', 'Create/edit/view social posts, media and share links', 'openAddPostModal clearPostMedia openEditPostModal populatePlatformSelect onPlatformSelectChanged updateLiveSpecHelper updateCaptionCounter setPostMedia handleFileSelect processUploadedFiles handleUrlApply handlePostFormSubmit openShareLink openPostDetailModal deleteCurrentDetailPost duplicateCurrentDetailPost'],
  'social/control-panel.js': ['controlPanelMethods', 'Platform control panel, standards matrix, import/export', 'openControlPanelModal renderControlPanelPlatformsList handleAddPlatform resetAllDefaults exportData importData openStandardsModal'],
  'social/notifications.js': ['notificationMethods', 'Promotion queue: events waiting to be turned into social posts', 'updateSocialNotificationBadge openSocialNotificationsModal renderSocialNotifications generateSocialPostFromEvent'],
  'events/model.js': ['eventModelMethods', 'Event queries, colours and permissions', 'getEventTheme getEventSurface isPastEventDate formatEventPrice getWeekDays getFilteredEvents canEditEvent'],
  'events/views.js': ['eventViewMethods', 'Events calendar: navigation, zoom levels, daily/monthly/yearly rendering', 'changeEventsPeriod jumpToEventsToday stepZoom setEventsZoomLevel toggleOffHours setEventsLayoutMode renderEventsCalendar renderEventsUserFilterBar renderEventsDailyTimeline renderEventsGrid renderEventsYearlyView'],
  'events/event-form.js': ['eventFormMethods', 'Event form: open/edit/submit, free-hours board, conflicts, suggestions, cover image', 'setEventTimingMode updateFreeHoursBoard setEventFormMode findSmartSuggestions applySmartSuggestion checkEventDateConflict resetFacebookValidation validateFacebookImage mountEventForm closeEventForm openScheduleEventPage openAddEventModal openEditEventModal handleEventFormSubmit computeRecurrenceDates updateRecurrencePreviewHint'],
  'events/wizard.js': ['wizardMethods', 'Scheduling wizard steps, entry types and room bookings', 'updateWizardConfig renderWizardIndicator setWizardStep validateCurrentWizardStep nextWizardStep prevWizardStep setEventEntryType populateSpaceSelect handleToggleNeedsRoom renderRoomBookingRows handleAddRoomBookingRow handleRemoveRoomBookingRow checkRoomConflict'],
  'events/my-events.js': ['myEventsMethods', 'My Events page and the event detail dialog', 'updateMyEventsBadgeCount renderMyEventsPage openEventDetailModal deleteCurrentDetailEvent'],
  'admin/panel.js': ['adminPanelMethods', 'Admin panel shell and events table', 'setAdminCategory renderAdminPanel adminDeleteEvent'],
  'admin/users.js': ['adminUserMethods', 'Admin: user accounts (server API)', 'handleCreateUser openEditUserModal handleEditUserSubmit deleteUser'],
  'admin/venues.js': ['adminVenueMethods', 'Admin: spaces and accommodation rooms', 'renderAdminSpaces handleCreateSpace handleDeleteSpace handleToggleSpace renderAdminRooms handleCreateRoom handleDeleteRoom handleToggleRoom'],
  'admin/storage-quota.js': ['storageQuotaMethods', 'Admin: storage usage, quota alerts and cleanup', 'calculateStorageUsage updateStorageQuotaDisplay getPastEvents openStorageCleanupModal updateCleanupModalPreviews executeCleanupPastEvents executeStripPastImages executeCleanupSocialMedia'],
};

// top-level names and where they will live
const topNames = {};
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') n.specifiers.forEach(s => topNames[s.local.name] = n.source.value.includes('i18n') ? 'data/i18n.js' : 'data/seed-data.js');
  if (n.type === 'VariableDeclaration') n.declarations.forEach(d => topNames[d.id.name] = 'constants.js');
  if (n.type === 'FunctionDeclaration') topNames[n.id.name] = 'constants.js';
}
const cls = ast.body.find(n => n.type === 'ClassDeclaration');
const members = cls.body.body;
const owner = {};
for (const [file, [, , names]] of Object.entries(MODULES)) names.split(' ').forEach(n => { if (owner[n]) throw Error('dup ' + n); owner[n] = file; });
const unassigned = members.filter(m => m.key.name !== 'constructor' && !owner[m.key.name]).map(m => m.key.name);
if (unassigned.length) throw Error('unassigned: ' + unassigned);
const missing = Object.keys(owner).filter(n => !members.some(m => m.key.name === n));
if (missing.length) throw Error('not found: ' + missing);

const usedTop = node => { const s = new Set(); walk.full(node, x => { if (x.type === 'Identifier' && topNames[x.name]) s.add(x.name); }); return s; };
const chunk = (m, i) => { // include comments/blank lines between previous member and this one
  const start = i === 0 ? js.indexOf('{', cls.body.start) + 1 : members[i - 1].end;
  return js.slice(start, m.end).replace(/^\s*\n/, '');
};
const rel = (from, to) => { let r = path.relative(path.dirname(from), to).split(path.sep).join('/'); return r.startsWith('.') ? r : './' + r; };
const importBlock = (file, names) => {
  const byFile = {};
  [...names].sort().forEach(n => (byFile[topNames[n]] = byFile[topNames[n]] || []).push(n));
  return Object.entries(byFile).map(([f, ns]) => `import { ${ns.join(', ')} } from "${rel(file, f)}";`).join('\n');
};

const out = {};
for (const [file, [exportName, desc, names]] of Object.entries(MODULES)) {
  const list = names.split(' ');
  const parts = [], used = new Set();
  members.forEach((m, i) => { if (list.includes(m.key.name)) { parts.push(chunk(m, i) + ','); usedTop(m).forEach(n => used.add(n)); } });
  const imp = importBlock(file, used);
  out[file] = `// ${desc}.\n// Mixed into SocialCalendarApp.prototype by src/app.js; \`this\` is the app instance.\n${imp ? imp + '\n' : ''}\nexport const ${exportName} = {\n${parts.join('\n').replace(/,\s*$/, '')}\n};\n`;
}
// app.js: constants + class shell with constructor + mixins + bootstrap
const ctorIdx = members.findIndex(m => m.key.name === 'constructor');
const ctor = chunk(members[ctorIdx], ctorIdx);
const ctorUsed = usedTop(members[ctorIdx]);
const files = Object.entries(MODULES);
out['app.js'] = `// Social Calendar & Workspace Suite — application entry point.
// The class holds state (constructor); behaviour lives in feature mixins under src/.
${importBlock('app.js', ctorUsed)}
${files.map(([f, [e]]) => `import { ${e} } from "./${f}";`).join('\n')}

class SocialCalendarApp {
${ctor}
}

const MIXINS = [
${files.map(([, [e]]) => '  ' + e).join(',\n')}
];

// Guard against two modules defining the same method (a later one would silently win).
const seen = new Map();
for (const mixin of MIXINS) {
  for (const name of Object.keys(mixin)) {
    if (seen.has(name) || name in SocialCalendarApp.prototype) throw new Error(\`Duplicate app method "\${name}"\`);
    seen.set(name, mixin);
  }
  Object.assign(SocialCalendarApp.prototype, mixin);
}

// Initialize Application once DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.calendarApp = new SocialCalendarApp();
});
`;
// constants.js: every top-level declaration from the old file, exported
const consts = ast.body.filter(n => n.type === 'VariableDeclaration' || n.type === 'FunctionDeclaration');
let cjs = '// Storage keys, limits and shared helpers.\n';
let prevEnd = null;
for (const n of consts) {
  // keep preceding comment lines
  const lineStart = js.lastIndexOf('\n', n.start) + 1;
  let pre = ''; let k = lineStart; const lines = js.slice(0, lineStart).split('\n'); lines.pop();
  const comments = []; while (lines.length && /^\s*\/\//.test(lines[lines.length - 1])) comments.unshift(lines.pop());
  cjs += (comments.length ? comments.join('\n') + '\n' : '') + 'export ' + js.slice(n.start, n.end) + '\n';
}
out['constants.js'] = cjs;

const SRC = path.join(PUB, 'src');
for (const [f, text] of Object.entries(out)) { const p = path.join(SRC, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
console.log(Object.entries(out).map(([f, t]) => f.padEnd(26) + t.split('\n').length).join('\n'));
