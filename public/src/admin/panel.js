// Admin panel shell and events table.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const adminPanelMethods = {
  // User edit and storage cleanup dialogs.
  bindAdminDialogs() {
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
  },
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
  },
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
    const sorted = [...this.events].sort((a, b) => new Date(`${a.startDate}T${a.hour || '00:00'}`) - new Date(`${b.startDate}T${b.hour || '00:00'}`));

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
          <strong>${evt.startDate}</strong>
          <span style="display: block; font-size: 0.72rem; color: var(--text-muted);">${evt.hour || '18:00'} (${evt.durationHours || 2}h)</span>
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
  },
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
};
