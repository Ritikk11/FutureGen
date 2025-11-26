import React, { useRef, useState } from 'react';
import { Icons } from './Icon';
import { ImageAsset } from '../types';

interface UploadZoneProps {
  label: string;
  image: ImageAsset | null;
  onImageUpload: (img: ImageAsset) => void;
  onClear: () => void;
  className?: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ 
  label, 
  image, 
  onImageUpload, 
  onClear,
  className = ""
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const base64 = (e.target?.result as string).split(',')[1];
        onImageUpload({
          data: base64,
          mimeType: file.type,
          width: img.width,
          height: img.height
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
        {label}
      </span>
      
      {image ? (
        <div className="relative group w-full h-64 bg-surface rounded-xl border border-gray-700 overflow-hidden">
          <img 
            src={`data:${image.mimeType};base64,${image.data}`} 
            alt="Uploaded" 
            className="w-full h-full object-contain bg-[#111]"
          />
          <button 
            onClick={onClear}
            className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Icons.Refresh className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div 
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all
            ${isDragging 
              ? 'border-primary bg-primary/10 text-primary' 
              : 'border-gray-700 hover:border-gray-500 text-gray-500 hover:text-gray-400 bg-surface'
            }
          `}
        >
          <Icons.Upload className={`w-10 h-10 mb-3 ${isDragging ? 'animate-bounce' : ''}`} />
          <p className="text-sm font-medium">Click or Drop Image</p>
          <p className="text-xs opacity-60 mt-1">Supports JPG, PNG, WEBP</p>
        </div>
      )}
      
      <input 
        type="file" 
        ref={inputRef} 
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="hidden" 
        accept="image/*"
      />
    </div>
  );
};
