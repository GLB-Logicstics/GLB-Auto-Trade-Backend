# GLB Auto Trade — Backend

Express 5 + PostgreSQL. Saytın bütün məlumatlarını saxlayır və iki API verir:

- `/api/public/*` — sayt üçün (açıq)
- `/api/admin/*` — admin panel üçün (giriş tələb edir)

## Quraşdırma

```bash
npm install
cp .env.example .env        # DATABASE_URL, TOKEN_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD yaz
createdb glb                # PostgreSQL-də baza yarat
npm run db:seed             # cədvəlləri yaradır və başlanğıc məlumatı yazır
npm run dev                 # http://localhost:4000
```

`npm run db:reset` bütün cədvəlləri silib yenidən yaradır — yalnız ilk quraşdırmada istifadə et.

Node 22+ lazımdır (`.env` faylı `node --env-file` ilə oxunur, əlavə paket yoxdur).

## Qovluqlar

| Fayl | Nə edir |
|---|---|
| `db/schema.sql` | Cədvəllər |
| `db/seed.json` | Başlanğıc məlumat (saytdakı köhnə statik data) |
| `src/index.js` | Server, CORS, route-lar, xəta idarəsi |
| `src/config.js` | `.env` ayarları |
| `src/db.js` | PostgreSQL bağlantısı, `query()` və `queryOne()` |
| `src/auth.js` | Şifrə hash (scrypt), token (HMAC), `requireAdmin` |
| `src/collections.js` | Kolleksiyaların siyahısı və köməkçi funksiyalar |
| `src/routes/public.js` | Sayt üçün API |
| `src/routes/admin.js` | Admin panel üçün API |
| `src/seed.js` | Bazanı doldurur |
| `uploads/` | Admin paneldən yüklənən şəkillər |

## Cədvəllər

Kolleksiya cədvəlləri eyni quruluşdadır:

| Sütun | Tip | Qeyd |
|---|---|---|
| `id` | serial | |
| `slug` | text, unikal | link üçün (lot, avtomobil, xidmət, səhifə) |
| `title` | text | admin siyahısı və axtarış üçün |
| `is_active` | boolean | `false` olanlar saytda görünmür |
| `sort_order` | integer | siyahıda sıra |
| `data` | jsonb | qalan bütün sahələr |

Kolleksiyalar: `lots`, `cars`, `korea_cars`, `parts`, `catalog`, `services`, `pages`, `news`, `hero_slides`, `brands`.

Digər cədvəllər:

- `settings` — `site`, `tariffs`, `price_history`, `tracking_sample` (açar → JSON)
- `shipping_prices` — auksion, meydança, qiymət (Excel-dən gələn 524 sətir)
- `requests` — saytdakı formalardan gələn müraciətlər
- `admins` — admin istifadəçilər

## Public API

| Metod | Ünvan | Nə qaytarır |
|---|---|---|
| GET | `/api/public/bootstrap` | Bütün aktiv məlumat, ayarlar və daşınma qiymətləri — sayt bir sorğu ilə yüklənir |
| GET | `/api/public/collections/:name` | Bir kolleksiyanın aktiv elementləri |
| POST | `/api/public/requests` | Müraciət yazır (`name`, `phone` mütləqdir) |

## Admin API

`Authorization: Bearer <token>` başlığı tələb olunur (login-dən başqa).

| Metod | Ünvan | Nə edir |
|---|---|---|
| POST | `/api/admin/login` | `{ email, password }` → `{ token, admin }` (7 gün) |
| GET | `/api/admin/me` | Daxil olmuş admin |
| GET | `/api/admin/stats` | İdarə paneli rəqəmləri |
| GET | `/api/admin/collections/:name?search=` | Siyahı |
| GET/POST/PUT/DELETE | `/api/admin/collections/:name/:id` | Bir element |
| GET | `/api/admin/settings` | Bütün ayarlar |
| PUT | `/api/admin/settings/:key` | `{ value }` |
| GET/POST/PUT/DELETE | `/api/admin/shipping` | Daşınma qiymətləri |
| GET/PUT/DELETE | `/api/admin/requests` | Müraciətlər (`status`, `note`) |
| POST | `/api/admin/upload` | `{ name, data: base64 }` → `{ url }` |

## Deploy

Render, Railway və ya VPS:

1. PostgreSQL yarat, `DATABASE_URL`-i `.env`-ə yaz.
2. `TOKEN_SECRET` — uzun təsadüfi mətn.
3. `CORS_ORIGINS` — sayt və admin panelin ünvanları, vergüllə.
4. `PUBLIC_URL` — backend-in öz ünvanı (yüklənən şəkillərin linki üçün).
5. `npm install && npm run db:seed && npm start`

Yüklənən şəkillər `uploads/` qovluğunda saxlanılır. Render kimi disk saxlamayan hostinqdə daimi disk qoşmaq və ya S3/Cloudinary-yə keçmək lazımdır.
