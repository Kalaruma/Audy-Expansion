// Replacement for the claude.ai artifact runtime (window.claude.use) on top of Supabase,
// so the Audy Expansion page (public/audy/page.html) runs unchanged outside claude.ai.
//   use("db")     -> document store (collections kandidat, keputusan, mall) in table public.audy_docs
//   use("user")   -> the signed-in Supabase user and their role in public.audy_members
//   use("sample") -> Claude via the Supabase Edge Function "claude" (null when not configured)
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "editor" | "contributor" | "viewer";

type Data = Record<string, unknown>;
interface Row { collection: string; id: string; data: Data }
interface Listener { next: (s: unknown) => void; error?: (e: unknown) => void; order?: { field: string; dir: "asc" | "desc" } }

const listeners = new Map<string, Set<Listener>>();
const dbError = (e: { code?: string; message?: string } | null) => {
  const msg = e?.message || "unknown error";
  const code = e?.code === "42501" || /row-level security|permission/i.test(msg) ? "invalid_argument" : "unavailable";
  return { code, message: msg };
};

async function readCollection(col: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("audy_docs").select("collection,id,data").eq("collection", col).order("id").range(from, from + 999);
    if (error) throw dbError(error);
    out.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const docSnap = (r: Row | null, id: string) => ({ id, exists: !!r, data: () => (r ? r.data : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
function querySnap(rows: Row[], order?: Listener["order"]) {
  let list = rows;
  if (order) {
    const f = order.field, s = order.dir === "desc" ? -1 : 1;
    list = [...rows].sort((a, b) => { const x = a.data[f] as never, y = b.data[f] as never; return (x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0) * s; });
  }
  const docs = list.map((r) => docSnap(r, r.id));
  return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => docs.map((doc, i) => ({ type: "added", doc, oldIndex: -1, newIndex: i })) };
}

const refreshing = new Map<string, Promise<void>>();
function refresh(col: string): Promise<void> {
  const set = listeners.get(col); if (!set || !set.size) return Promise.resolve();
  if (refreshing.has(col)) return refreshing.get(col)!;
  const p = readCollection(col)
    .then((rows) => { set.forEach((l) => { try { l.next(querySnap(rows, l.order)); } catch (e) { console.error(e); } }); })
    .catch((e) => set.forEach((l) => l.error?.(e)))
    .finally(() => refreshing.delete(col));
  refreshing.set(col, p); return p;
}

let realtimeOn = false;
function startRealtime() {
  if (realtimeOn) return; realtimeOn = true;
  supabase.channel("audy_docs_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "audy_docs" }, (payload: any) => {
      const col = (payload.new && payload.new.collection) || (payload.old && payload.old.collection);
      if (col) refresh(col); else listeners.forEach((_s, c) => refresh(c));
    })
    .subscribe();
  // safety net when realtime is off for the table
  setInterval(() => listeners.forEach((_s, c) => refresh(c)), 30000);
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const splitPath = (path: string) => { const parts = path.split("/"); if (parts.length !== 2) throw new TypeError(`unsupported path "${path}" (use collection/doc)`); return parts as [string, string]; };

function docRef(col: string, id: string) {
  return {
    id, path: `${col}/${id}`,
    async get() { const { data, error } = await supabase.from("audy_docs").select("collection,id,data").eq("collection", col).eq("id", id).maybeSingle(); if (error) throw dbError(error); return docSnap(data as Row | null, id); },
    async set(data: Data) {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("audy_docs").upsert({ collection: col, id, data, updated_by: u.user?.id, updated_at: new Date().toISOString() });
      if (error) throw dbError(error); setTimeout(() => refresh(col), 0);
    },
    async update(fields: Data) {
      const cur = await this.get(); if (!cur.exists) throw { code: "invalid_argument", message: "document does not exist" };
      const base = { ...(cur.data() as Data) };
      for (const [k, v] of Object.entries(fields)) {
        if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) base[k] = { ...(base[k] as Data), ...(v as Data) };
        else if (v === undefined) continue; else base[k] = v;
      }
      await this.set(base);
    },
    async delete() { const { error } = await supabase.from("audy_docs").delete().eq("collection", col).eq("id", id); if (error) throw dbError(error); setTimeout(() => refresh(col), 0); },
    onSnapshot(next: (s: unknown) => void, error?: (e: unknown) => void) {
      let alive = true; const tick = () => this.get().then((s) => alive && next(s)).catch((e) => alive && error?.(e));
      tick(); const t = setInterval(tick, 30000); return () => { alive = false; clearInterval(t); };
    },
  };
}

function query(col: string, order?: Listener["order"]) {
  return {
    orderBy(field: string, dir: "asc" | "desc" = "asc") { return query(col, { field, dir }); },
    where() { return this; }, limit() { return this; },
    async get() { return querySnap(await readCollection(col), order); },
    onSnapshot(next: (s: unknown) => void, error?: (e: unknown) => void) {
      const l: Listener = { next, error, order };
      if (!listeners.has(col)) listeners.set(col, new Set());
      listeners.get(col)!.add(l); startRealtime();
      readCollection(col).then((rows) => next(querySnap(rows, order))).catch((e) => error?.(e));
      return () => { listeners.get(col)?.delete(l); };
    },
  };
}

function collectionRef(col: string) {
  return {
    ...query(col), path: col,
    doc(id?: string) { return docRef(col, id || newId()); },
    async add(data: Data) { const ref = docRef(col, newId()); await ref.set(data); return ref; },
  };
}

const db = {
  collection(path: string) { if (path.includes("/")) throw new TypeError("nested collections are not supported"); return collectionRef(path); },
  doc(path: string) { const [c, id] = splitPath(path); return docRef(c, id); },
};

// ------------------------------------------------------------------ user
export interface Person { user_id: string; email: string; role: Role }
let people: Person[] = [];
async function loadPeople() { const { data } = await supabase.rpc("audy_people"); people = (data || []) as Person[]; return people; }
function userApi(user: User, role: Role) {
  const name = (id: string) => (people.find((p) => p.user_id === id)?.email || "").split("@")[0];
  const prof = (id: string) => ({ id, name: name(id), avatarUrl: "", color: "#6b7280", email: null, isMe: id === user.id, guest: false });
  return {
    isOwner: async () => role === "owner",
    canEdit: async () => role === "owner" || role === "editor",
    can: async (c: string) => (c === "data.write" ? role !== "viewer" : role === "owner" || role === "editor"),
    id: async () => user.id,
    me: async () => ({ ...prof(user.id), name: (user.email || "").split("@")[0], email: user.email || null, isOwner: role === "owner", canEdit: role === "owner" || role === "editor" }),
    name: async () => (user.email || "").split("@")[0],
    avatarUrl: async () => null,
    email: async () => user.email || null,
    profiles: async (ids: string[] | string) => { const list = Array.isArray(ids) ? ids : [ids]; if (list.some((i) => !people.find((p) => p.user_id === i))) await loadPeople(); return Object.fromEntries(list.map((i) => [i, prof(i)])); },
    search: async () => [],
  };
}

// ------------------------------------------------------------------ sample (Claude via Edge Function)
async function sampleApi() {
  try {
    const { data, error } = await supabase.functions.invoke("claude", { body: { ping: true } });
    if (error || !(data as { ok?: boolean })?.ok) return null;
  } catch { return null; }
  const call = async (input: unknown) => {
    const { data, error } = await supabase.functions.invoke("claude", { body: { input } });
    if (error) throw { code: /429/.test(String(error.message)) ? "rate_limited" : "unavailable", message: error.message };
    const d = data as { text?: string; error?: string; code?: string };
    if (d.error) throw { code: d.code || "unavailable", message: d.error };
    return d.text || "";
  };
  const sample = async (input: unknown, opts?: { onText?: (x: { text: string; delta: string }) => void }) => {
    const text = await call(input); opts?.onText?.({ text, delta: text }); return { text, truncated: false };
  };
  (sample as any).json = async (input: unknown) => {
    const text = await call(input);
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    try { return JSON.parse(m ? m[1] : text); } catch { throw { code: "invalid_json", message: "Claude tidak membalas JSON yang valid", text }; }
  };
  (sample as any).limits = async () => ({ modelTiers: ["default"] });
  return sample;
}

/** Install window.claude for the page. */
export function installClaudeShim(user: User, role: Role) {
  loadPeople();
  let samplePromise: Promise<unknown> | null = null;
  (window as any).claude = {
    use: async (name: string) => {
      if (name === "db") return role ? db : null;
      if (name === "user") return userApi(user, role);
      if (name === "sample") { if (!samplePromise) samplePromise = sampleApi(); return samplePromise; }
      return null;
    },
  };
}
