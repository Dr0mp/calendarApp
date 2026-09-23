// Admin: spaces and accommodation rooms.
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

export const adminVenueMethods = {
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
          <div class="u-flex u-items-center u-gap-8 u-fw-700">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${space.color || '#38bdf8'}; flex-shrink: 0;"></span>
            <span>${this.escapeHtml(space.name)}</span>
          </div>
        </td>
        <td><strong>${space.capacity || '-'}</strong></td>
        <td><span class="u-color-muted u-text-xs">${this.escapeHtml(space.desc || '-')}</span></td>
        <td><strong>${usageCount}</strong> <span class="u-text-2xs u-color-muted">${countLabel}</span></td>
        <td>
          <span class="user-role-badge ${isEnabled ? 'role-admin' : ''}" style="${isEnabled ? 'background: rgba(34, 197, 94, 0.15); color: #4ade80; border-color: rgba(34, 197, 94, 0.3);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
            ${isEnabled ? (this.t("cp_status_active")) : (this.t("cp_status_disabled"))}
          </span>
        </td>
        <td>
          <div class="u-flex u-gap-6 u-items-center">
            <button class="btn btn-secondary btn-sm btn-toggle-space" data-id="${space.id}">${isEnabled ? (this.t("btn_disable")) : (this.t("btn_enable"))}</button>
            <button class="btn btn-danger btn-sm btn-del-space" data-id="${space.id}">${this.t("admin_delete_btn")}</button>
          </div>
        </td>
      `;

      tr.querySelector(".btn-toggle-space")?.addEventListener("click", () => this.handleToggleSpace(space.id));
      tr.querySelector(".btn-del-space")?.addEventListener("click", () => this.handleDeleteSpace(space.id));

      this.dom.adminSpacesTableBody.appendChild(tr);
    });
  },
  handleCreateSpace(e) {
    e.preventDefault();
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
  },
  async handleDeleteSpace(id) {
    const space = (this.spaces || []).find(s => s.id === id);
    if (!space) return;
    if (await this.confirmDialog(this.t("confirm_delete_space").replace("${name}", space.name))) {
      this.spaces = this.spaces.filter(s => s.id !== id);
      this.saveSpaces();
      this.renderAdminSpaces();
    }
  },
  handleToggleSpace(id) {
    const space = (this.spaces || []).find(s => s.id === id);
    if (!space) return;
    space.enabled = space.enabled === false ? true : false;
    this.saveSpaces();
    this.renderAdminSpaces();
  },
  renderAdminRooms() {
    if (!this.dom.adminRoomsTableBody) return;
    this.dom.adminRoomsTableBody.innerHTML = "";

    (this.rooms || []).forEach(room => {
      const usageCount = this.events.filter(e => e.roomId === room.id).length;
      const isEnabled = room.enabled !== false;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="u-flex u-items-center u-gap-8 u-fw-700">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${room.color || '#a855f7'}; flex-shrink: 0;"></span>
            <span>${this.icon("bed")} ${this.escapeHtml(room.name)}</span>
          </div>
        </td>
        <td><span class="badge-subtle">${this.escapeHtml(room.type || 'Standard')}</span></td>
        <td><strong>${room.capacity || 2}</strong> <span class="u-text-2xs u-color-muted">${this.currentLang === 'ro' ? 'oaspeți' : 'guests'} (${room.beds || 1} ${this.currentLang === 'ro' ? 'paturi' : 'beds'})</span></td>
        <td><span class="u-color-muted u-text-xs">${this.escapeHtml(room.notes || '-')}</span></td>
        <td><strong>${usageCount}</strong> <span class="u-text-2xs u-color-muted">${this.t("admin_th_room_bookings")}</span></td>
        <td>
          <span class="user-role-badge ${isEnabled ? 'role-admin' : ''}" style="${isEnabled ? 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border-color: rgba(168, 85, 247, 0.3);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
            ${isEnabled ? (this.t("cp_status_active")) : (this.t("cp_status_disabled"))}
          </span>
        </td>
        <td>
          <div class="u-flex u-gap-6 u-items-center">
            <button class="btn btn-secondary btn-sm btn-toggle-room" data-id="${room.id}">${isEnabled ? (this.t("btn_disable")) : (this.t("btn_enable"))}</button>
            <button class="btn btn-danger btn-sm btn-del-room" data-id="${room.id}">${this.t("admin_delete_btn")}</button>
          </div>
        </td>
      `;

      tr.querySelector(".btn-toggle-room")?.addEventListener("click", () => this.handleToggleRoom(room.id));
      tr.querySelector(".btn-del-room")?.addEventListener("click", () => this.handleDeleteRoom(room.id));

      this.dom.adminRoomsTableBody.appendChild(tr);
    });
  },
  handleCreateRoom(e) {
    e.preventDefault();
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
  },
  async handleDeleteRoom(id) {
    const room = (this.rooms || []).find(r => r.id === id);
    if (!room) return;
    if (await this.confirmDialog(this.t("confirm_delete_room").replace("${name}", room.name))) {
      this.rooms = this.rooms.filter(r => r.id !== id);
      this.saveRooms();
      this.renderAdminRooms();
    }
  },
  handleToggleRoom(id) {
    const room = (this.rooms || []).find(r => r.id === id);
    if (!room) return;
    room.enabled = room.enabled === false ? true : false;
    this.saveRooms();
    this.renderAdminRooms();
  }
};
