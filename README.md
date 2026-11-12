# Audy Expansion — versi Lovable

Halaman **Audy Expansion** (artefak claude.ai versi 15) yang sama persis, dijalankan sebagai aplikasi web sendiri:

- **Login**, dengan peran tim: Owner, Editor, Contributor, dan Viewer. Tim tidak perlu akun Claude.
- **Approval 3 langkah**: Usulan (kuning), Ruko ada (hijau), Disetujui (ungu). Ditolak tampil abu-abu. Hanya email penyetuju yang didaftarkan Owner yang bisa menyetujui. Aturan ini dikunci di database.
- **Link titik**: tombol "Salin link titik ini" membuat link yang langsung membuka titik tersebut.
- **Kandidat, approval, dan data mall** tersimpan bersama di Supabase. Data dari artefak (16 kandidat, 1 keputusan, 485 mall beserta editannya) ikut dipindahkan.
- Tombol **"Minta analisa Claude"** dan **"Cari titik dengan Claude"** aktif bila API key Anthropic diisi. Ini opsional.

Isi peta tidak berubah: pasien Audy, 70 cabang, 694 outlet kompetitor, mall A/B, lifestyle, lingkar 3/5 km, kandidat, approval, master data, layar penuh, dan seterusnya.

## Cara kerjanya

| Bagian | File |
|---|---|
| Halaman Audy Expansion (tidak diubah) | `public/audy/page.html` |
| Data peta (pasien, cabang, kompetitor, mall, kecamatan) | `public/audy/data.json` |
| Pengganti fitur claude.ai: database, pengguna, Claude | `src/claudeShim.ts` |
| Login, panel Tim, pemuat halaman | `src/App.tsx` |
| Database Supabase + data dari artefak | `supabase/migrations/*.sql` |
| Fungsi Claude (opsional) | `supabase/functions/claude/index.ts` |
| Sumber artefak (template + CSS Leaflet) | `artifact-source/` |

Untuk memperbarui halaman dari artefak baru, simpan HTML artefak lalu jalankan:
```bash
python scripts/split_artifact.py audy-expansion.html
```

---

## Instalasi di Lovable, langkah demi langkah

### Langkah 1 — Buat project Lovable dari repo ini
1. Buka **lovable.dev** dan masuk.
2. Klik **New project**, lalu cari **Import from GitHub** (atau **Connect existing repository**).
3. Izinkan Lovable mengakses GitHub. Pilih akun **Kalaruma**, lalu pilih repo ini.
4. Tunggu Lovable selesai membaca kode. Preview akan menampilkan halaman login.
   - Kalau Lovable **tidak menawarkan import**, buat project kosong, lalu buka **GitHub → Connect to GitHub**. Lovable membuat repo baru. Isi repo baru itu dengan file dari repo ini, atau minta Claude yang mengisinya.

### Langkah 2 — Sambungkan Supabase
1. Di Lovable klik **Supabase** (kanan atas) atau **Integrations → Supabase**, lalu **Connect**.
2. Pilih organisasi Supabase dan **buat project baru** (misalnya `audy-expansion`, region **Singapore**). Simpan password database-nya.
3. Lovable akan mengisi `src/integrations/supabase/client.ts` secara otomatis. Itu normal.

### Langkah 3 — Buat tabel dan masukkan data dari artefak
1. Buka **supabase.com/dashboard**, lalu pilih project tadi.
2. Klik **SQL Editor**, lalu **New query**.
3. Buka file `supabase/migrations/20261111000001_audy_schema.sql` di GitHub, klik **Raw**, salin semua, tempel di SQL Editor, lalu klik **Run**. Pastikan hasilnya *Success*.
4. Ulangi untuk `supabase/migrations/20261111000002_audy_seed.sql`. File ini berisi 16 kandidat, 1 keputusan, dan 485 mall.
5. Ulangi untuk `supabase/migrations/20261112000003_audy_approvers.sql`. File ini memasang aturan approval: hanya Owner dan penyetuju terdaftar yang bisa menyetujui.
6. Cek di **Table Editor → audy_docs**. Harus ada 503 baris.

> Lovable kadang menjalankan file migrasi sendiri saat Supabase tersambung. Kalau tabel `audy_docs` sudah ada dan berisi 503 baris, langkah 3 tidak perlu diulang.

> **Sudah pernah memasang versi sebelumnya?** Cukup jalankan file `20261112000003_audy_approvers.sql` saja. Data yang sudah ada tidak berubah.

### Langkah 4 — Atur login
1. Di Supabase buka **Authentication → URL Configuration**.
2. **Site URL**: isi alamat aplikasi Lovable Anda (misalnya `https://audy-expansion.lovable.app`).
3. **Redirect URLs**: tambahkan alamat yang sama, dan alamat preview Lovable (`https://*.lovableproject.com/**`).
4. Opsional, supaya bisa langsung masuk tanpa email konfirmasi: **Authentication → Providers → Email**, matikan **Confirm email**.

### Langkah 5 — Masuk pertama kali (Anda jadi Owner)
1. Buka preview Lovable, klik **Daftar**, lalu isi email dan password Anda.
2. **Orang pertama yang masuk otomatis menjadi Owner.** Pastikan Anda yang pertama.
3. Peta Audy Expansion terbuka, lengkap dengan 16 kandidat dari artefak.

### Langkah 6 — Undang tim
1. Minta anggota tim membuka alamat aplikasi dan **Daftar**. Mereka otomatis menjadi **Viewer** (hanya bisa melihat).
2. Klik **Tim** di kanan atas, lalu ubah peran mereka:
   - **Contributor**: bisa menambah, edit, dan hapus kandidat, serta menandai **Ruko ada**.
   - **Editor**: bisa juga mengedit data mall.
   - **Owner**: bisa juga mengatur peran orang lain, mengatur daftar penyetuju, dan menyetujui.
3. Orang yang perannya diubah perlu memuat ulang halaman.
4. Supaya orang luar tidak bisa mendaftar sendiri, nonaktifkan pendaftaran: Supabase → **Authentication → Providers → Email → Enable sign ups: off**. Setelah itu, tambahkan anggota lewat **Authentication → Users → Invite user**.

### Langkah 6b — Daftarkan penyetuju lokasi
1. Buka bagian **Kandidat lokasi untuk approval**, lalu cari kotak **Penyetuju lokasi**.
2. Ketik email anggota tim, lalu pilih dari daftar, atau klik **Tambah penyetuju**. Email boleh didaftarkan sebelum orangnya mendaftar.
3. Penyetuju harus masuk dengan email yang sama persis. Perannya boleh apa saja, termasuk Viewer.
4. Alurnya:
   - Kandidat baru berstatus **Usulan** (kuning).
   - Setelah ruko dicek, Contributor/Editor/Owner klik **✓ Ruko ada** (hijau).
   - Setelah itu baru penyetuju bisa klik **Setujui** (ungu) atau **Tolak** (abu-abu).

### Langkah 7 (opsional) — Aktifkan tombol Claude
1. Buat API key di **console.anthropic.com** → API Keys. Pemakaiannya ditagih ke akun Anthropic Anda.
2. Simpan key di Supabase: **Edge Functions → Secrets → Add secret**, dengan nama `ANTHROPIC_API_KEY`.
3. Deploy fungsinya. Di chat Lovable, ketik: *"Deploy the Supabase edge function in supabase/functions/claude"*. Atau lewat Supabase CLI:
   ```bash
   supabase functions deploy claude
   ```
4. Muat ulang aplikasi. Tombol **Minta analisa Claude** (di bagian Kandidat) dan **Cari titik dengan Claude** (di pencarian) akan muncul.

Fungsi ini memakai model `claude-opus-5-5`. Kalau sebuah permintaan ditolak filter keamanan, API otomatis mencoba lagi dengan model cadangan (`fallbacks: "default"`).

### Langkah 8 — Publish
Di Lovable klik **Publish**. Aplikasi akan bisa dibuka di alamat `*.lovable.app` atau domain Anda sendiri.

---

## Catatan keamanan data
- **Data peta tidak terkunci login.** Isinya jumlah pasien per kecamatan, cabang, dan kompetitor, disimpan di `public/audy/data.json`. Siapa pun yang tahu alamat file itu bisa mengunduhnya. Kandidat, approval, dan mall di database **terkunci login** dan hanya bisa dibaca anggota tim. Kalau data pasien perlu dikunci juga, data.json bisa dipindah ke Supabase Storage privat; minta bantuan Claude untuk mengubahnya.
- **Tombol Claude mengirim data kandidat ke API Anthropic** untuk dianalisa.
- **Nama pembuat di kandidat lama** belum punya akun Supabase, jadi nama pembuatnya tampil kosong.

## Menjalankan di komputer sendiri
1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` menjadi `.env`, lalu isi URL dan key Supabase:
   ```bash
   cp .env.example .env
   ```
3. Jalankan. Aplikasi terbuka di http://localhost:8080.
   ```bash
   npm run dev
   ```
