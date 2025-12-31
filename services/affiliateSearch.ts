export type AffiliateItem = {
  title: string;
  price: number;
  currency: string;
  image: string;
  affiliate_link: string;
};

export async function affiliateSearch(query: string): Promise<AffiliateItem[]> {
  const res = await fetch(
    `/api/search-affiliate?q=${encodeURIComponent(query)}`
  );

  if (!res.ok) {
    throw new Error("Affiliate search failed");
  }

  const data = await res.json();

  // 🔑 זה העיקר: מחזירים את results מה-Backend
  if (Array.isArray(data.results)) {
    return data.results; // ← כל ה-5
  }

  // fallback (תאימות אחורה)
  if (data.title) {
    return [
      {
        title: data.title,
        price: data.price,
        currency: data.currency,
        image: data.image,
        affiliate_link: data.affiliate_link
      }
    ];
  }

  return [];
}
