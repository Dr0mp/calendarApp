// Workspace data (platforms, posts, events, spaces, rooms) kept in a JSON file on the server,
// plus uploaded media in a folder next to it. One DataStore per dataset: the real workspace
// and the demo workspace (which is reset to the sample content on start and every night).
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const COLLECTIONS = ["platforms", "posts", "events", "spaces", "rooms"];
const MAX_ITEM_BYTES = 256 * 1024; // one record; media lives in uploads/, not inside the JSON
const ID_RE = /^[\w.:@-]{1,200}$/;

// Allowed upload types, recognised by their first bytes (the browser's Content-Type is not trusted).
const SIGNATURES = [
  { ext: "jpg", type: "image/jpeg", test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", type: "image/png", test: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "gif", type: "image/gif", test: b => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { ext: "webp", type: "image/webp", test: b => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { ext: "mp4", type: "video/mp4", test: b => b.subarray(4, 8).toString("latin1") === "ftyp" && !/^qt/.test(b.subarray(8, 10).toString("latin1")) },
  { ext: "mov", type: "video/quicktime", test: b => b.subarray(4, 8).toString("latin1") === "ftyp" },
  { ext: "webm", type: "video/webm", test: b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 }
];
export const sniffMedia = buf => SIGNATURES.find(s => buf.length >= 12 && s.test(buf)) || null;

// Events saved by older builds carried duplicate fields (date = startDate, time = hour).
function normalizeEvent(event) {
  if (!event || (!("date" in event) && !("time" in event))) return event;
  const { date, time, ...rest } = event;
  rest.startDate = rest.startDate || date;
  rest.endDate = rest.endDate || rest.startDate;
  rest.hour = rest.hour || time;
  return rest;
}

export class DataStore {
  /**
   * @param {object} o
   * @param {string} o.file        JSON file holding the collections
   * @param {string} o.uploadsDir  folder for uploaded media
   * @param {string} o.urlPrefix   public URL prefix of uploadsDir (e.g. "/uploads")
   * @param {() => object} o.seed  returns a fresh copy of the sample content
   * @param {number} o.capBytes    storage cap for this dataset
   */
  constructor({ file, uploadsDir, urlPrefix, seed, capBytes }) {
    Object.assign(this, { file, uploadsDir, urlPrefix, seed, capBytes });
    this.data = null;
    this.fileSizes = new Map(); // upload name -> bytes
    this.writeQueue = Promise.resolve();
    this.uploadRe = new RegExp(`${urlPrefix.replace(/[/]/g, "\\/")}\\/([\\w-]+\\.[a-z0-9]+)`, "g");
  }

  // Loads the file, or creates it from the sample content when it doesn't exist yet.
  init({ reset = false } = {}) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    if (reset) {
      for (const name of fs.readdirSync(this.uploadsDir)) fs.rmSync(path.join(this.uploadsDir, name), { force: true });
    }
    if (!reset && fs.existsSync(this.file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      } catch (e) {
        throw new Error(`${this.file} is not valid JSON. Fix it or restore a backup.`);
      }
    } else {
      this.data = this.seed();
    }
    for (const c of COLLECTIONS) if (!Array.isArray(this.data[c])) this.data[c] = [];
    this.data.events = this.data.events.map(normalizeEvent);
    this.fileSizes.clear();
    for (const name of fs.readdirSync(this.uploadsDir)) {
      const st = fs.statSync(path.join(this.uploadsDir, name));
      if (st.isFile()) this.fileSizes.set(name, st.size);
    }
    return this.persist();
  }

  persist() {
    const snapshot = JSON.stringify(this.data, null, 1);
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, "utf8");
      await fs.promises.rename(tmp, this.file);
    }).catch(err => console.error(`Error saving ${this.file}:`, err));
    return this.writeQueue;
  }

  snapshot() {
    return { ...Object.fromEntries(COLLECTIONS.map(c => [c, this.data[c]])), storage: this.usage() };
  }

  uploadsIn(item) {
    const names = new Set();
    for (const m of JSON.stringify(item).matchAll(this.uploadRe)) names.add(m[1]);
    return names;
  }

  // Bytes used by events and by posts: their records plus the media files they reference.
  usage() {
    const measure = list => {
      let bytes = Buffer.byteLength(JSON.stringify(list));
      const files = new Set();
      for (const item of list) for (const n of this.uploadsIn(item)) files.add(n);
      for (const n of files) bytes += this.fileSizes.get(n) || 0;
      return bytes;
    };
    const eventsBytes = measure(this.data.events);
    const postsBytes = measure(this.data.posts);
    // Files not referenced yet (just uploaded, form not saved) still take disk space.
    const referenced = new Set();
    for (const c of ["events", "posts"]) for (const item of this.data[c]) for (const n of this.uploadsIn(item)) referenced.add(n);
    let pendingBytes = 0;
    for (const [n, size] of this.fileSizes) if (!referenced.has(n)) pendingBytes += size;
    const usedBytes = eventsBytes + postsBytes + pendingBytes;
    // Size of every referenced media file, so the cleanup screen can show what it would free.
    const files = {};
    for (const n of referenced) if (this.fileSizes.has(n)) files[`${this.urlPrefix}/${n}`] = this.fileSizes.get(n);
    return { eventsBytes, postsBytes, pendingBytes, usedBytes, capBytes: this.capBytes, files };
  }

  /**
   * Applies a batch of changes to one collection after checking every item.
   * @param {string} collection
   * @param {{upserts?: object[], deletes?: string[], order?: string[]}} body
   * @param {(action: "create"|"update"|"delete"|"order", item: object|null, existing: object|null) => string|null} authorize
   *        returns an error code to refuse, or null to allow
   */
  async sync(collection, body, authorize) {
    const list = this.data[collection];
    const upserts = Array.isArray(body?.upserts) ? body.upserts : [];
    const deletes = Array.isArray(body?.deletes) ? body.deletes : [];
    const order = Array.isArray(body?.order) ? body.order : null;
    const byId = new Map(list.map(i => [i.id, i]));

    // 1. Validate everything first, so a refused item leaves nothing half-applied.
    let growth = 0;
    for (const item of upserts) {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !ID_RE.test(item.id)) {
        return { status: 400, code: "invalid_item" };
      }
      const size = Buffer.byteLength(JSON.stringify(item));
      if (size > MAX_ITEM_BYTES) return { status: 413, code: "item_too_large" };
      if (/"data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(JSON.stringify(item))) return { status: 400, code: "inline_media_not_allowed" };
      const existing = byId.get(item.id) || null;
      const refusal = authorize(existing ? "update" : "create", item, existing);
      if (refusal) return { status: 403, code: refusal };
      growth += size - (existing ? Buffer.byteLength(JSON.stringify(existing)) : 0);
    }
    for (const id of deletes) {
      const existing = byId.get(id);
      if (!existing) continue; // already gone
      const refusal = authorize("delete", null, existing);
      if (refusal) return { status: 403, code: refusal };
    }
    if (order) {
      const refusal = authorize("order", null, null);
      if (refusal) return { status: 403, code: refusal };
    }
    if (growth > 0 && this.usage().usedBytes + growth > this.capBytes) return { status: 507, code: "storage_full" };

    // 2. Apply.
    const before = new Set();
    const touched = [...upserts.map(i => byId.get(i.id)), ...deletes.map(id => byId.get(id))].filter(Boolean);
    for (const item of touched) for (const n of this.uploadsIn(item)) before.add(n);

    const deleteSet = new Set(deletes);
    let next = list.filter(i => !deleteSet.has(i.id));
    const index = new Map(next.map((i, n) => [i.id, n]));
    for (const item of upserts) {
      const clean = collection === "events" ? normalizeEvent(item) : item;
      if (index.has(item.id)) next[index.get(item.id)] = clean;
      else { index.set(item.id, next.length); next.push(clean); }
    }
    if (order) {
      const rank = new Map(order.map((id, n) => [id, n]));
      next = next.map((item, n) => ({ item, n })).sort((a, b) => (rank.get(a.item.id) ?? 1e9 + a.n) - (rank.get(b.item.id) ?? 1e9 + b.n)).map(x => x.item);
    }
    this.data[collection] = next;

    // 3. Media that the changed records referenced and nothing references any more is deleted now.
    if (before.size) {
      const stillUsed = new Set();
      for (const c of COLLECTIONS) for (const item of this.data[c]) for (const n of this.uploadsIn(item)) if (before.has(n)) stillUsed.add(n);
      for (const n of before) if (!stillUsed.has(n)) this.removeUpload(n);
    }
    await this.persist();
    return { status: 200, storage: this.usage() };
  }

  // Saves an uploaded file; returns { url } or { status, code }.
  async saveUpload(buf) {
    const kind = sniffMedia(buf);
    if (!kind) return { status: 415, code: "unsupported_media" };
    if (this.usage().usedBytes + buf.length > this.capBytes) return { status: 507, code: "storage_full" };
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(9).toString("base64url")}.${kind.ext}`;
    await fs.promises.writeFile(path.join(this.uploadsDir, name), buf);
    this.fileSizes.set(name, buf.length);
    return { status: 201, url: `${this.urlPrefix}/${name}`, type: kind.type, storage: this.usage() };
  }

  removeUpload(name) {
    if (!/^[\w-]+\.[a-z0-9]+$/.test(name)) return;
    fs.rmSync(path.join(this.uploadsDir, name), { force: true });
    this.fileSizes.delete(name);
  }

  // Deletes uploads that no record references and that are older than `graceMs`
  // (a file picked in a form that was then cancelled).
  collectGarbage(graceMs = 60 * 60 * 1000) {
    const referenced = new Set();
    for (const c of COLLECTIONS) for (const item of this.data[c]) for (const n of this.uploadsIn(item)) referenced.add(n);
    const now = Date.now();
    for (const name of [...this.fileSizes.keys()]) {
      if (referenced.has(name)) continue;
      try {
        if (now - fs.statSync(path.join(this.uploadsDir, name)).mtimeMs > graceMs) this.removeUpload(name);
      } catch { this.fileSizes.delete(name); }
    }
  }
}
