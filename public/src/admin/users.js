// Admin: user accounts (server API).
// Mixed into SocialCalendarApp.prototype by src/app.js; `this` is the app instance.

import { apiRequest } from "../core/utils.js";

export const adminUserMethods = {
  async handleCreateUser(e) {
    e.preventDefault();
    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_admin_save"), "warning");
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
        this.notify(data.error || this.t("alert_username_taken").replace("${username}", username), "danger");
        return;
      }

      await this.fetchServerUsers();
      this.dom.createUserForm.reset();
      this.renderAdminPanel();
      this.notify(this.t("alert_user_created").replace("${name}", name), "success");
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
    this.dom.editUserPassword.placeholder = this.t(isSystemAdmin ? "edit_user_pass_placeholder_root" : "edit_user_pass_placeholder");
    this.dom.editUserRole.value = user.role || "user";
    this.dom.editUserRole.disabled = isSystemAdmin;

    this.renderEditUserPasskeys(user);
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
      this.notify(this.t("demo_no_admin_save"), "warning");
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
      this.notify(this.t("alert_fill_required"), "danger");
      return;
    }

    try {
      const { res, data } = await apiRequest("PUT", `/api/users/${userId}`, { name, username, password, role });
      if (!res.ok) {
        this.notify(data.error || this.t("alert_username_in_use").replace("${username}", username), "danger");
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
      this.notify(this.t("alert_user_updated").replace("${name}", name), "success");
    } catch (err) {
      console.error("Edit user error:", err);
    }
  },
  async deleteUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    if (this.isDemoAccount()) {
      this.notify(this.t("demo_no_admin_save"), "warning");
      return;
    }

    if (user.username.toLowerCase() === "admin") {
      this.notify(this.t("alert_admin_no_delete"), "warning");
      return;
    }

    if (this.currentUser && this.currentUser.id === userId) {
      this.notify(this.t("alert_cannot_delete_self"), "danger");
      return;
    }

    if (await this.confirmDialog(this.t("confirm_delete_user").replace("${name}", user.name))) {
      try {
        const { res, data } = await apiRequest("DELETE", `/api/users/${userId}`);
        if (!res.ok) {
          this.notify(data.error || (this.t("alert_delete_user_failed")), "danger");
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
