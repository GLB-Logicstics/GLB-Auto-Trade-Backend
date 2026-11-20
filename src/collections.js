export const collections = {
  lots: { label: 'Hərrac lotları', title: (item) => item.title },
  cars: { label: 'Satışda olan avtomobillər', title: (item) => item.title },
  korea_cars: { label: 'Koreya avtomobilləri', title: (item) => item.title },
  parts: { label: 'Ehtiyat hissələri', title: (item) => item.title },
  catalog: { label: 'Kataloq', title: (item) => `${item.make} ${item.model} ${item.year}` },
  services: { label: 'Xidmətlər', title: (item) => item.title },
  pages: { label: 'Məlumat səhifələri', title: (item) => item.title },
  news: { label: 'Xəbərlər', title: (item) => item.title },
  hero_slides: { label: 'Ana səhifə slayderi', title: (item) => item.title },
  brands: { label: 'Markalar', title: (item) => item.name },
  part_types: { label: 'Hissə kateqoriyaları', title: (item) => item.label },
}

export const settingKeys = ['site', 'tariffs', 'price_history', 'tracking_sample', 'menus', 'locations']

export function findCollection(name) {
  return Object.hasOwn(collections, name) ? collections[name] : null
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function toItem(row) {
  const item = { ...row.data, id: row.id }
  if (row.slug) item.slug = row.slug
  return item
}

export function toAdminItem(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
