import React, { useState, useEffect } from 'react';
import { ShoppingBag, LayoutGrid, PlusCircle, Search, Gift, Lock, LogOut, Settings, Cloud, CloudOff, AlertTriangle } from 'lucide-react';
import { Product, ViewState } from './types';
import { subscribeToProducts, addProduct, removeProduct } from './services/storageService';
import { isDbConnected } from './services/firebase';
import { ProductCard } from './components/ProductCard';
import { AdminPanel } from './components/AdminPanel';
import { AdminSettings } from './components/AdminSettings';
import { Login } from './components/Login';
import { Button } from './components/Button';

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<ViewState>('home');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Subscribe to data changes (Real-time DB)
  useEffect(() => {
    const unsubscribe = subscribeToProducts(
      (updatedProducts) => {
        setProducts(updatedProducts);
        setIsLoading(false);
        setDbError(null); // Clear error on success
      },
      (error) => {
        setDbError(error);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAddProduct = async (product: Product) => {
    // Optimistic update
    setProducts(prev => [product, ...prev]);
    try {
      await addProduct(product);
      setView('home');
    } catch (e) {
      alert("Failed to save to cloud database. It might be a permission issue.");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      // Optimistic update
      setProducts(prev => prev.filter(p => p.id !== id));
      await removeProduct(id);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    setView('home');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setView('home');
  };

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[]))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div 
                className="flex items-center gap-2 cursor-pointer" 
                onClick={() => setView('home')}
            >
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white">
                <ShoppingBag size={20} />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-brand-900">
                Special-Products
              </span>
            </div>

            {view === 'home' && (
                <div className="hidden md:flex flex-1 max-w-lg mx-8">
                    <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search for amazing deals..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-full leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-colors"
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4 ml-auto">
              {/* Database Status Indicator (Only visible to admin or for debug) */}
              {isAuthenticated && (
                <div 
                    title={
                      dbError === 'permission-denied' ? "Permission Denied: Check Firestore Rules" : 
                      dbError ? `Error: ${dbError}` :
                      isDbConnected ? "Connected to Cloud DB" : "Using Local Storage (Not Shared)"
                    }
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      dbError ? 'bg-red-100 text-red-700 cursor-help' :
                      isDbConnected ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}
                >
                    {dbError ? (
                       <>
                        <AlertTriangle size={14} />
                        <span className="hidden lg:inline">Error</span>
                       </>
                    ) : isDbConnected ? (
                      <>
                        <Cloud size={14} />
                        <span className="hidden lg:inline">Live</span>
                      </>
                    ) : (
                      <>
                        <CloudOff size={14} />
                        <span className="hidden lg:inline">Local</span>
                      </>
                    )}
                </div>
              )}

              {isAuthenticated ? (
                <>
                  {view === 'home' ? (
                    <Button 
                        variant="primary" 
                        icon={<PlusCircle size={18} />}
                        onClick={() => setView('admin')}
                    >
                      <span className="hidden sm:inline">Add Product</span>
                    </Button>
                  ) : (
                    <Button 
                        variant="secondary"
                        icon={<LayoutGrid size={18} />} 
                        onClick={() => setView('home')}
                    >
                      View Catalog
                    </Button>
                  )}
                  
                  <button 
                    onClick={() => setView('settings')}
                    className={`p-2 transition-colors ${view === 'settings' ? 'text-brand-600 bg-brand-50 rounded-full' : 'text-gray-500 hover:text-brand-600'}`}
                    title="Settings"
                  >
                    <Settings size={20} />
                  </button>

                  <button 
                    onClick={handleLogout}
                    className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                    title="Logout"
                  >
                    <LogOut size={20} />
                  </button>
                </>
              ) : (
                <button 
                    onClick={() => setView('login')}
                    className="p-2 text-gray-500 hover:text-brand-600 transition-colors"
                    title="Admin Login"
                >
                    <Lock size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Mobile Search Bar (only visible on small screens when home) */}
        {view === 'home' && (
            <div className="md:hidden px-4 pb-4 border-t border-gray-100 pt-2">
                <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search deals..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:bg-white focus:border-brand-500"
                    />
                </div>
            </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {view === 'login' ? (
           <Login onLogin={handleLogin} onCancel={() => setView('home')} /> 
        ) : view === 'settings' && isAuthenticated ? (
           <AdminSettings onCancel={() => setView('home')} />
        ) : view === 'admin' && isAuthenticated ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-gray-900">Product Manager</h1>
                <p className="mt-2 text-gray-600">Add new affiliate products to your store. Use AI to auto-generate content.</p>
                
                {/* Status Messages for Admin */}
                {!isDbConnected && (
                    <div className="mt-4 p-3 bg-orange-50 text-orange-800 text-sm inline-block rounded-lg border border-orange-200">
                        Warning: Database not configured in .env. Products are only saved on this device.
                    </div>
                )}
                
                {isDbConnected && dbError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-800 text-sm inline-block rounded-lg border border-red-200">
                     {dbError === 'permission-denied' 
                        ? 'Error: Permission Denied. Go to Firebase Console > Firestore > Rules and allow read/write.'
                        : `Error connecting to database: ${dbError}`
                     }
                  </div>
                )}
            </div>
            <AdminPanel 
              onAddProduct={handleAddProduct} 
              onCancel={() => setView('home')} 
            />
          </div>
        ) : (
          <>
            {/* Category Filter */}
            {categories.length > 1 && view === 'home' && (
                <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                                selectedCategory === cat 
                                    ? 'bg-gray-900 text-white' 
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
                </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-50 mb-4">
                    <Gift className="w-8 h-8 text-brand-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">No products found</h3>
                <p className="mt-1 text-gray-500 max-w-sm mx-auto">
                    {searchTerm 
                        ? `No results for "${searchTerm}". Try a different keyword.` 
                        : "No products yet."}
                </p>
                {/* Only show "Add First Product" if authenticated */}
                {isAuthenticated && !searchTerm && (
                    <div className="mt-6">
                        <Button onClick={() => setView('admin')}>
                            Add First Product
                        </Button>
                    </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProducts.map(product => (
                  <ProductCard 
                    key={product.id} 
                    product={product} 
                    isAdmin={isAuthenticated} 
                    onDelete={handleDeleteProduct}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-brand-600" />
            <span className="font-semibold text-gray-900">Special-Products</span>
          </div>
          <p className="text-sm text-gray-500">
            © 2025 Special-Products Powered by K.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;