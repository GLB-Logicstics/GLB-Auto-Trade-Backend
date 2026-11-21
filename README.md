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

`npm run admin:reset` — `.env`-dəki `ADMIN_EMAIL` / `ADMIN_PASSWORD` ilə admini yaradır və ya şifrəsini yeniləyir (giriş alınmayanda).

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

Kolleksiyalar: `lots`, `cars`, `korea_cars`, `parts`, `part_types`, `catalog`, `services`, `pages`, `news`, `hero_slides`, `brands`.

Tərcümə olunan mətnlər elementin `data.i18n` sahəsindədir: `{ "en": { "title": "..." }, "ru": { ... } }`. Boş qalan sahədə sayt əsas dildəki mətni göstərir.

Digər cədvəllər:

- `settings` — `site`, `tariffs`, `price_history`, `tracking_sample`, `menus`, `locations` (açar → JSON)
- `shipping_prices` — auksion, meydança, qiymət (Excel-dən gələn 524 sətir)
- `requests` — saytdakı formalardan gələn müraciətlər
- `admins` — admin istifadəçilər, `role`: `admin` / `manager` / `editor`
- `users` — saytda qeydiyyatdan keçənlər, `role`: `user` / `dealer`, `dealer_status`: `pending` / `approved` / `rejected`
- `languages`, `translations` — dillər və interfeys mətnləri (açar = Azərbaycan dilindəki mətn)
- `market_prices` — yerli bazar qiymətləri (ölkə, marka, model, il)
- `car_clicks` — avtomobil səhifəsində WhatsApp/zəng klikləri
- `audit_logs` — admin paneldə edilən dəyişikliklərin jurnalı

## Rollar

| Rol | Bölmələr |
|---|---|
| developer | hamısı + menyular, dillər (`.env`-dəki admin bu roldadır) |
| admin | menyu və dillərdən başqa hamısı, developer hesablarını görmür |
| manager | idarə paneli, müraciətlər, istifadəçilər, kontent, qiymətlər |
| editor | idarə paneli, kontent, sayt ayarları, tərcümələr |

İcazələr `src/auth.js` → `PERMISSIONS`-dədir.

## İstifadəçi API (`/api/user`)

| Metod | Ünvan | Nə edir |
|---|---|---|
| POST | `/register` | `{ name, email, phone, password }` — yalnız admin paneldə "Saytda qeydiyyat" açıqdırsa. Diler hesablarını admin yaradır (`POST /api/admin/users`) |
| POST | `/login` | `{ email, password }` → `{ token, user }` |
| GET/PUT | `/me` | Profil |
| PUT | `/password` | `{ current, next }` |
| GET | `/requests` | İstifadəçinin müraciətləri |
| GET/POST/PUT/DELETE | `/cars`, `/cars/:id` | Diler kabineti (yalnız təsdiqlənmiş diler). Yeni avtomobil admin təsdiqinə qədər gizlidir |
| POST | `/upload` | Diler şəkli |

## Saytı yenilə düyməsi

Sayt GitHub Pages-dədirsə, admin paneldəki "Saytı yenilə" düyməsi GitHub Actions-ı işə salır. `.env`-də yaz:

```
GITHUB_REPO=istifadeci/GLB-Auto-Trade
GITHUB_TOKEN=github_pat_...   # Fine-grained token, həmin repo üçün "Contents: Read and write"
```

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

## Yerli bazar qiymətləri (avtomatik)

`src/market.js` kataloqdakı və satışdakı hər marka/model/il üçün Gemini-dən (Google AI) Azərbaycan və Gürcüstan bazarında orta qiyməti soruşur və `market_prices`-ə yazır. Gemini əvvəlcə Google axtarışı ilə turbo.az və myauto.ge elanlarına baxır (mənbə: `AI · Google axtarışı · N elan`). Kifayət qədər elan tapılmasa, ən yaxın il və versiyalara əsasən təxmin edir. Axtarış alınmasa, axtarışsız təxmin verir (mənbə: `AI təxmini`). Beləliklə hər avtomobilə qiymət yazılır.

- Açar: `GEMINI_API_KEY` (Google AI Studio). Model: `GEMINI_MODEL`, standart `gemini-3.5-flash`.
- Google axtarışı yalnız billing aktiv olan layihədə işləyir. Billing yoxdursa, bütün qiymətlər `AI təxmini` olur.
- Gündə bir dəfə Vercel Cron ilə, admin paneldə isə "İndi yenilə" ilə işləyir. Söndürmək üçün `.env`: `MARKET_SYNC=off`.
- Admin ağlabatan olmayan qiyməti silə bilər, növbəti yeniləmədə yenidən hesablanır.

## Avtomobil izləmə

`shipments` kolleksiyası (admin paneldə "Avtomobil izləmə"). Sayt `GET /api/public/tracking?code=VIN_və_ya_LOT` ilə yalnız bir avtomobili alır, siyahı açıq deyil.

## Deploy

Vercel + Neon + Cloudinary üçün addımlar: [DEPLOY.md](DEPLOY.md).
