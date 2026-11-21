# Deploy: Vercel + Neon

Ən sadə yol: Vercel layihəsində **Storage → Create Database → Neon** və **Storage → Blob**. Vercel `DATABASE_URL` və `BLOB_READ_WRITE_TOKEN`-u özü yazır. Build zamanı `npm run vercel-build` boş bazaya cədvəlləri və başlanğıc məlumatı yazır (dolu bazaya toxunmur). Admin üçün `ADMIN_EMAIL` və `ADMIN_PASSWORD` (Secret) əlavə et. `TOKEN_SECRET` yazılmasa bazanın ünvanından avtomatik yaranır.

Aşağıdakı addımlar əl ilə (Neon və Cloudinary hesabı ilə) qurmaq üçündür.

# Deploy: Vercel + Neon + Cloudinary

Hər üç layihə Vercel-də, baza Neon-da, şəkillər Cloudinary-də. Hamısı pulsuz plandır. Repolar gizli qalır, saytlar yalnız linki bilənlərə açıqdır (axtarış sistemləri indeksləmir).

## 1. Neon (baza)

1. https://neon.tech → GitHub ilə daxil ol → **New project** (region: Frankfurt).
2. **Connection string**-i kopyala (`postgresql://...neon.tech/neondb?sslmode=require`).
3. Kompüterdə backend qovluğunda `.env`-də `DATABASE_URL`-u bu sətirlə əvəz et və bir dəfə işlət:

```bash
npm run db:reset
npm run admin:reset
```

Sonra `.env`-i yenidən localhost bazasına qaytara bilərsən.

## 2. Cloudinary (şəkillər)

https://cloudinary.com → qeydiyyat → Dashboard-da **API environment variable** (`cloudinary://KEY:SECRET@CLOUD`) kopyala.

## 3. Vercel — backend

1. https://vercel.com → GitHub ilə daxil ol → **Add New → Project** → `GLB-Auto-Trade-Backend`.
2. Framework: **Other**. Branch: `dev` (və ya `main`).
3. **Environment Variables**:

| Ad | Dəyər |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `TOKEN_SECRET` | uzun təsadüfi mətn |
| `CLOUDINARY_URL` | Cloudinary sətri |
| `CRON_SECRET` | uzun təsadüfi mətn (bazar qiymətləri üçün gündəlik iş) |
| `GEMINI_API_KEY` | Google AI Studio açarı — bazar qiymətlərini AI ilə tapmaq üçün |
| `GEMINI_MODEL` | istəyə bağlı, standart `gemini-3.5-flash` |
| `CORS_ORIGINS` | sayt və admin linkləri, vergüllə (4-cü addımdan sonra yaz) |
| `PUBLIC_URL` | backend-in öz linki |

4. **Deploy**. Yoxla: `https://BACKEND-LINK/api/health` → `{"ok":true}`.

## 4. Vercel — sayt və admin

`GLB-Auto-Trade-Nuxt` və `GLB-Auto-Trade-Admin-Nuxt` üçün ayrıca **Add New → Project** (Framework: **Nuxt**, avtomatik tanınır).

| Layihə | Environment Variables |
|---|---|
| Sayt | `NUXT_PUBLIC_API_BASE=https://BACKEND-LINK/api` |
| Admin | `NUXT_PUBLIC_API_BASE=https://BACKEND-LINK/api`, `NUXT_PUBLIC_SITE_URL=https://SAYT-LINK` |

Deploy-dan sonra backend-də `CORS_ORIGINS=https://SAYT-LINK,https://ADMIN-LINK` yaz və backend-i **Redeploy** et.

## Qeydlər

- Saytı Google-a açmaq üçün sayt layihəsində `SITE_INDEX=true` əlavə et və redeploy et.
- Bazar qiymətləri hər gün 06:00-da (Bakı vaxtı) Vercel Cron ilə yenilənir, admin paneldə "İndi yenilə" də işləyir.
- Admin paneldə dəyişiklik saytda dərhal görünür, yenidən deploy lazım deyil.
- Kod `dev`-ə push olunanda Vercel avtomatik yenidən deploy edir (layihədə seçilmiş branch-a görə).
