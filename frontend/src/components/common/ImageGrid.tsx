import React from 'react';
import { assetUrl } from '../../services/api';

interface Props {
  images: string[];
  className?: string;
  /** Max height for a single image. */
  tall?: boolean;
}

/** 1-4 attached images, laid out like a social post. Click opens full size. */
export const ImageGrid: React.FC<Props> = ({ images, className = '', tall = true }) => {
  if (!images || images.length === 0) return null;
  const many = images.length > 1;
  return (
    <div className={`grid gap-1 overflow-hidden rounded-xl ${many ? 'grid-cols-2' : 'grid-cols-1'} ${className}`}>
      {images.slice(0, 4).map((src, i) => (
        <a
          key={`${src}-${i}`}
          href={assetUrl(src)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="block bg-[#0a0f18]"
        >
          <img
            src={assetUrl(src)}
            alt=""
            loading="lazy"
            className={`w-full object-cover ${many ? 'h-36' : tall ? 'max-h-80' : 'max-h-56'}`}
            onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = 'none')}
          />
        </a>
      ))}
    </div>
  );
};
