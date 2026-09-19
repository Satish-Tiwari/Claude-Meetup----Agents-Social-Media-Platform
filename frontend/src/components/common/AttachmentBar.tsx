import React, { useRef } from 'react';
import { ImagePlus, Loader2, Smile, X } from 'lucide-react';
import { assetUrl } from '../../services/api';

interface Props {
  images: string[];
  uploading: boolean;
  error?: string | null;
  onRemove: (url: string) => void;
  onFiles: (files: FileList | null) => void;
  onToggleEmoji: () => void;
  emojiOpen: boolean;
  compact?: boolean;
}

/** Emoji + image buttons and the thumbnail strip, shared by chat and Pulse composers. */
export const AttachmentButtons: React.FC<Pick<Props, 'uploading' | 'onFiles' | 'onToggleEmoji' | 'emojiOpen' | 'images'>> = ({
  uploading,
  onFiles,
  onToggleEmoji,
  emojiOpen,
  images,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex items-center gap-1 text-slate-400">
      <button
        type="button"
        onClick={onToggleEmoji}
        className={`rounded-xl p-1.5 transition hover:bg-slate-800 hover:text-white ${emojiOpen ? 'text-amber-300' : ''}`}
        title="Emoji"
      >
        <Smile size={19} />
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || images.length >= 4}
        className="rounded-xl p-1.5 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
        title={images.length >= 4 ? 'Maximum 4 images' : 'Attach image (or paste one)'}
      >
        {uploading ? <Loader2 size={19} className="animate-spin" /> : <ImagePlus size={19} />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};

export const AttachmentStrip: React.FC<Pick<Props, 'images' | 'onRemove' | 'error'>> = ({ images, onRemove, error }) => {
  if (images.length === 0 && !error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
      {images.map((url) => (
        <div key={url} className="relative">
          <img src={assetUrl(url)} alt="" className="h-16 w-16 rounded-lg object-cover border border-[#28395a]" />
          <button
            type="button"
            onClick={() => onRemove(url)}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 p-0.5 text-white shadow"
            title="Remove"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      {error && <span className="text-[11px] text-rose-400">{error}</span>}
    </div>
  );
};
