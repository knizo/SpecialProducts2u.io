import React, { useEffect, useState } from 'react';
import { ShoppingBag, Gift } from 'lucide-react';

import { Product, ViewState } from './types';
import { subscribeToProducts } from './services/storageService';
import { affiliateSearch, type AffiliateItem } from './services/affiliateSearch';

import { ProductCard } from './components/ProductCard';

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [affiliateResults, setAffiliateResults] = useState<Product[]>([]);
  const [isAffiliateSearch, setIsAffiliateSearch] = useState(false);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  const [view, setView] = useState<ViewState>('home');
  const [searchTerm, setSearchTerm] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToProducts(
      (updatedProducts) => {
        setProducts(updatedProducts);
        setIsLoading(false);
        setDbError(null);
      },
      (error) => {
        setDbError(error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAffiliateSearch = async () => {
    if (!searchTerm.trim()) return;

    setAffiliateLoading(true);
    try {
      // affiliateSearch מחזיר תמיד מערך (עד 3)
      const items: AffiliateItem[] = await affiliateSearch(searchTerm);

      const mappedProducts: Product[] = items.slice(0, 3).map((item: AffiliateItem, idx: number) => ({
        id: `${Date.now()}-${idx}`,
        title: item.title,
        description: 'Top deal from AliExpress',
        price: Number(item.price) || 0,
        currency: item.currency || 'USD',
        imageUrl: item.image,
        affiliateLink: item.affiliate_link,
        category: 'AliExpress',
        createdAt: Date.now()
      }));

      setAffiliateResults(mappedProducts);
      setIsAffiliateSearch(true);
    } catch (e) {
      console.error(e);
      alert('AliExpress search failed');
    } finally {
      setAffiliateLoading(false);
    }
  };

  // כמו קודם: אם מוחקים את הטקסט, חוזרים למצב רגיל (מוצרים מקומיים)
  useEffect(() => {
    if (!searchTerm) {
      setIsAffiliateSearch(false);
      setAffiliateResults([]);
    }
  }, [searchTerm]);

  // כמו קודם: חיפוש מסנן מוצרים מקומיים מיד
  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.title.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term)
    );
  });

  // אם לחצו AliExpress -> מציגים תוצאות affiliate, אחרת מוצרים מקומיים מסוננים
  const displayedProducts = isAffiliateSearch ? affiliateResults : filteredProducts;

  return (
    <div className="min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white">
              <ShoppingBag size={20} />
            </div>
            <span className="text-xl font-bold">Special-Products</span>
          </div>

          {view === 'home' && (
            <div className="hidden md:flex flex-1 max-w-xl mx-6 items-center">
              <div className="relative w-full flex">
                <input
                  type="text"
                  placeholder="Search for amazing deals..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-4 py-2 border border-gray-200 rounded-l-full"
                />
                <button
                  onClick={handleAffiliateSearch}
                  disabled={affiliateLoading}
                  className="px-4 rounded-r-full bg-orange-500 text-white text-sm hover:bg-orange-600 disabled:opacity-50"
                >
                  {affiliateLoading ? 'Searching...' : 'AliExpress'}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 w-full">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-12 w-12 border-b-2 border-brand-600 rounded-full" />
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="text-center py-20">
            <Gift className="mx-auto mb-4 text-brand-500" size={40} />
            <p>{dbError ? `DB Error: ${dbError}` : 'No products found'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
