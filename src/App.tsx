import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { installClaudeShim, type Person, type Role } from "@/claudeShim";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Editor (kandidat + edit mall)", contributor: "Contributor (tambah kandidat & tandai ruko)", viewer: "Viewer (lihat saja)" };

function Login() {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [mode, setMode] = useState<"in" | "up">("in"), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg("");
        const r = mode === "in" ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
        setBusy(false);
        if (r.error) setMsg(r.error.message); else if (mode === "up" && !r.data.session) setMsg("Cek email Anda untuk konfirmasi, lalu masuk.");
      }}>
        <small>Audy Dental · Business Development</small>
        <h1>Audy Expansion</h1>
        <p>Masuk untuk membuka peta ekspansi, kandidat lokasi dan approval.</p>
        <input type="email" required placeholder="email@audydental.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required minLength={6} placeholder="Kata sandi" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button disabled={busy}>{mode === "in" ? "Masuk" : "Daftar"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}</button>
        {msg && <div className="err">{msg}</div>}
      </form>
    </div>
  );
}

function Team({ role, onClose }: { role: Role; onClose: () => void }) {
  const [list, setList] = useState<Person[]>([]), [msg, setMsg] = useState("");
  const load = () => supabase.rpc("audy_people").then(({ data }) => setList((data || []) as Person[]));
  useEffect(() => { load(); }, []);
  return (
    <div className="modal" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <h2>Tim</h2>
        <p>Orang yang mendaftar otomatis menjadi <b>Viewer</b>. {role === "owner" ? "Ubah perannya di sini." : "Hanya owner yang bisa mengubah peran."}</p>
        <table><tbody>{list.map((p) => (
          <tr key={p.user_id}><td>{p.email}</td><td>{role === "owner" ? (
            <select value={p.role} onChange={async (e) => { const { error } = await supabase.rpc("audy_set_role", { target_email: p.email, new_role: e.target.value }); setMsg(error ? error.message : "Tersimpan. Orangnya perlu memuat ulang halaman."); load(); }}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>) : ROLE_LABEL[p.role]}</td></tr>))}</tbody></table>
        {msg && <p className="note">{msg}</p>}
        <button onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}

/** Loads public/audy/page.html (the Audy Expansion page) and runs its scripts in order. */
function AudyPage() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Memuat peta…");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [html, data] = await Promise.all([fetch("/audy/page.html").then((r) => r.text()), fetch("/audy/data.json").then((r) => r.json())]);
      if (cancelled || !host.current) return;
      (window as any).__AUDY_DATA__ = data;
      const tpl = document.createElement("template"); tpl.innerHTML = html;
      const scripts = Array.from(tpl.content.querySelectorAll("script")); scripts.forEach((s) => s.remove());
      host.current.replaceChildren(tpl.content);
      for (const old of scripts) {
        const s = document.createElement("script");
        if (old.src) { s.src = old.src; await new Promise<void>((ok, bad) => { s.onload = () => ok(); s.onerror = () => bad(new Error("Gagal memuat " + old.src)); document.body.appendChild(s); }); }
        else { s.textContent = old.textContent; document.body.appendChild(s); }
      }
      setStatus("");
    })().catch((e) => setStatus("Gagal memuat halaman: " + e.message));
    return () => { cancelled = true; };
  }, []);
  return <>{status && <div className="status">{status}</div>}<div ref={host} /></>;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null>(null);
  const [err, setErr] = useState("");
  const [team, setTeam] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) setRole(null); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    supabase.rpc("audy_join").then(({ data, error }) => {
      if (error) { setErr("Database belum siap: " + error.message + ". Jalankan migrasi Supabase (lihat README)."); return; }
      installClaudeShim(session.user, data as Role); setRole(data as Role);
    });
  }, [session]);

  if (session === undefined) return <div className="status">Memuat…</div>;
  if (!session) return <Login />;
  if (err) return <div className="status err">{err}</div>;
  if (!role) return <div className="status">Menyiapkan akun…</div>;
  return (
    <>
      <div className="topbar">
        <span>{session.user.email} · {ROLE_LABEL[role].split(" (")[0]}</span>
        <button onClick={() => setTeam(true)}>Tim</button>
        <button onClick={() => { supabase.auth.signOut(); window.location.reload(); }}>Keluar</button>
      </div>
      <AudyPage />
      {team && <Team role={role} onClose={() => setTeam(false)} />}
    </>
  );
}
