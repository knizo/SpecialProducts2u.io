import { useState } from "react";
import { affiliateSearch } from "../services/affiliateSearch";

type Props = {
  onResults: (products: any[]) => void;
};

export default function SearchBar({ onResults }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const result = await affiliateSearch(query);
      onResults([result]);
    } catch (err) {
      alert("Search failed, try again");
    } finally {
      setLoading(false);
    }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 w-full max-w-2xl mx-auto"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for amazing deals..."
        className="flex-1 px-4 py-2 rounded-full border border-gray-300 focus:outline-none"
      />

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2 rounded-full bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {loading ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
