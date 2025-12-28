export type AffiliateItem = {
  title: string;
  price: number | string;
  currency?: string;
  image: string;
  affiliate_link: string;
  score?: number;
};

export async function affiliateSearch(query: string): Promise<AffiliateItem[]> {
  const res = await fetch(`/api/search-affiliate?q=${encodeURIComponent(query)}`);

  if (!res.ok) {
    throw new Error("Affiliate search failed");
  }

  const data = await res.json();

  // ✅ פורמט חדש: data.results (Top 3)
  if (Array.isArray(data?.results)) {
    return data.results.slice(0, 3);
  }

  // ✅ תאימות אחורה: פורמט ישן של תוצאה אחת
  if (data?.title && data?.image && data?.affiliate_link != null) {
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

  // אם משהו חריג חזר
  return [];
}
