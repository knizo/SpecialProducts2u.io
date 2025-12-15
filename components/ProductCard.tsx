import React from 'react';
import { ExternalLink, Tag, Trash2 } from 'lucide-react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, isAdmin, onDelete }) => {
  return (
    <div className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden border border-gray-100 flex flex-col h-full">
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img 
          src={product.imageUrl} 
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://picsum.photos/400/400?random=${product.id}`;
          }}
        />
        {isAdmin && (
          <button 
            onClick={() => onDelete?.(product.id)}
            className="absolute top-2 right-2 p-2 bg-white/90 text-red-600 rounded-full shadow-sm hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete Product"
          >
            <Trash2 size={16} />
          </button>
        )}
        <div className="absolute bottom-2 left-2">
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white/90 text-gray-800 shadow-sm backdrop-blur-sm">
                <Tag size={12} className="mr-1" />
                {product.category || 'Deal'}
            </span>
        </div>
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-lg font-semibold text-gray-900 line-clamp-1 mb-1" title={product.title}>
          {product.title}
        </h3>
        <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-grow">
          {product.description}
        </p>
        
        <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-50">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Price</span>
            <span className="text-xl font-bold text-brand-600">
              ${product.price.toFixed(2)}
            </span>
          </div>
          
          <a 
            href={product.affiliateLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors group-hover:bg-brand-600"
          >
            Buy Now
            <ExternalLink size={14} className="ml-2" />
          </a>
        </div>
      </div>
    </div>
  );
};
