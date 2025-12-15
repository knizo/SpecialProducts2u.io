import React, { useState } from 'react';
import { Plus, Sparkles, Wand2 } from 'lucide-react';
import { Product, ProductFormData } from '../types';
import { Button } from './Button';
import { generateProductDescription, suggestCategory } from '../services/geminiService';

interface AdminPanelProps {
  onAddProduct: (product: Product) => void;
  onCancel: () => void;
}

const INITIAL_FORM: ProductFormData = {
  title: '',
  price: '',
  imageUrl: '',
  affiliateLink: '',
  description: '',
  category: ''
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ onAddProduct, onCancel }) => {
  const [formData, setFormData] = useState<ProductFormData>(INITIAL_FORM);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateAI = async () => {
    if (!formData.title) return;
    
    setIsGenerating(true);
    try {
        const category = await suggestCategory(formData.title);
        const description = await generateProductDescription(formData.title, category);
        
        setFormData(prev => ({
            ...prev,
            category,
            description
        }));
    } catch (e) {
        console.error(e);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(formData.price);
    
    const newProduct: Product = {
      id: crypto.randomUUID(),
      title: formData.title,
      price: isNaN(price) ? 0 : price,
      currency: 'USD',
      imageUrl: formData.imageUrl || `https://picsum.photos/400/400?random=${Date.now()}`,
      affiliateLink: formData.affiliateLink || '#',
      description: formData.description,
      category: formData.category || 'Uncategorized',
      createdAt: Date.now()
    };

    onAddProduct(newProduct);
    setFormData(INITIAL_FORM);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center">
          <Plus className="w-5 h-5 mr-2 text-brand-600" />
          Add New Product
        </h2>
        <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
            Admin Mode
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Title Section */}
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                <div className="flex gap-2">
                    <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g. Wireless Noise Cancelling Headphones"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                    />
                    <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleGenerateAI}
                        disabled={!formData.title || isGenerating}
                        isLoading={isGenerating}
                        className="shrink-0"
                    >
                        <Sparkles size={16} className={isGenerating ? "" : "text-brand-600"} />
                        <span className="ml-2 hidden sm:inline">Auto-Fill with AI</span>
                    </Button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                    Enter the product name and click Auto-Fill to generate description and category.
                </p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD)</label>
            <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400">$</span>
                <input
                type="number"
                name="price"
                step="0.01"
                required
                value={formData.price}
                onChange={handleInputChange}
                className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              placeholder="e.g. Electronics"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input
            type="url"
            name="imageUrl"
            value={formData.imageUrl}
            onChange={handleInputChange}
            placeholder="https://ae01.alicdn.com/..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">Leave empty to use a random placeholder image.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Affiliate Link</label>
          <input
            type="url"
            name="affiliateLink"
            value={formData.affiliateLink}
            onChange={handleInputChange}
            placeholder="https://s.click.aliexpress.com/..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <div className="relative">
            <textarea
                name="description"
                rows={3}
                required
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Detailed product description..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
            />
            {isGenerating && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
                    <Wand2 className="animate-pulse text-brand-600" />
                </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            Publish Product
          </Button>
        </div>
      </form>
    </div>
  );
};
