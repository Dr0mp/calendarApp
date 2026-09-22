// Admin: user accounts (server API).
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

import { apiRequest } from "../core/utils.js";

export const adminUserMethods = {
  async handleCreateUser(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const name = this.dom.newUserFullname.value.trim();
    const username = this.dom.newUserUsername.value.trim().toLowerCase();
    const password = this.dom.newUserPassword.value.trim();
    const role = this.dom.newUserRole.value;

    if (!name || !username || !password) return;

    try {
      const { res, data } = await apiRequest("POST", "/api/users", { name, username, password, role });
      if (!res.ok) {
        alert(data.error || this.t("alert_username_taken").replace("${username}", username));
        return;
      }

      await this.fetchServerUsers();
      this.dom.createUserForm.reset();
      this.renderAdminPanel();
      alert(this.t("alert_user_created").replace("${name}", name));
    } catch (err) {
      console.error("Create user error:", err);
    }
  },
  openEditUserModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;
    const isSystemAdmin = user.username.toLowerCase() === "admin";

    this.dom.editUserId.value = user.id;
    this.dom.editUserFullname.value = user.name || "";
    this.dom.editUserUsername.value = user.username || "";
    this.dom.editUserUsername.disabled = isSystemAdmin;
    this.dom.editUserPassword.value = "";
    this.dom.editUserPassword.placeholder = isSystemAdmin ? "Enter new password (or leave empty)" : "Leave empty to keep password";
    this.dom.editUserRole.value = user.role || "user";
    this.dom.editUserRole.disabled = isSystemAdmin;

    this.dom.editUserDialog.showModal();
    setTimeout(() => {
      if (isSystemAdmin) {
        this.dom.editUserPassword.focus();
      } else {
        this.dom.editUserFullname.focus();
      }
    }, 50);
  },
  async handleEditUserSubmit(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }
    const userId = this.dom.editUserId.value;
    const name = this.dom.editUserFullname.value.trim();
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    const isSystemAdmin = user.username.toLowerCase() === "admin";
    const username = isSystemAdmin ? "admin" : this.dom.editUserUsername.value.trim().toLowerCase();
    const password = this.dom.editUserPassword.value.trim();
    const role = isSystemAdmin ? "admin" : this.dom.editUserRole.value;

    if (!name || !username) {
      alert(this.t("alert_fill_required"));
      return;
    }

    try {
      const { res, data } = await apiRequest("PUT", `/api/users/${userId}`, { name, username, password, role });
      if (!res.ok) {
        alert(data.error || this.t("alert_username_in_use").replace("${username}", username));
        return;
      }

      const oldUsername = user.username;
      // Update creator username and name on events if changed
      if (oldUsername !== username || name !== user.name) {
        this.events.forEach(evt => {
          if (evt.creatorId === userId || evt.creatorUsername === oldUsername) {
            evt.creatorUsername = username;
            evt.creatorName = name;
          }
        });
        this.saveEvents();
      }

      if (this.currentUser && this.currentUser.id === userId) {
        this.currentUser.name = name;
        this.updateUserNavDisplay();
      }

      await this.fetchServerUsers();
      this.dom.editUserDialog.close();
      this.renderAdminPanel();
      alert(this.t("alert_user_updated").replace("${name}", name));
    } catch (err) {
      console.error("Edit user error:", err);
    }
  },
  async deleteUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    if (this.isDemoAccount()) {
      alert(this.t("demo_no_admin_save"));
      return;
    }

    if (user.username.toLowerCase() === "admin") {
      alert(this.t("alert_admin_no_delete"));
      return;
    }

    if (this.currentUser && this.currentUser.id === userId) {
      alert(this.t("alert_cannot_delete_self"));
      return;
    }

    if (confirm(this.t("confirm_delete_user").replace("${name}", user.name))) {
      try {
        const { res, data } = await apiRequest("DELETE", `/api/users/${userId}`);
        if (!res.ok) {
          alert(data.error || (this.t("alert_delete_user_failed")));
          return;
        }

        await this.fetchServerUsers();
        this.renderAdminPanel();
      } catch (err) {
        console.error("Delete user error:", err);
      }
    }
  }
};
