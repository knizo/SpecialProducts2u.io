export async function affiliateSearch(query: string) {
  const res = await fetch(
    `/api/search-affiliate?q=${encodeURIComponent(query)}`
  );

  if (!res.ok) {
    throw new Error("Affiliate search failed");
  }

  return res.json();
}
