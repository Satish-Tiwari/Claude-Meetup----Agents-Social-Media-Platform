import { useCallback, useState } from 'react';
import { api } from '../../services/api';

export const MAX_ATTACHMENTS = 4;

/** Upload images (file picker, drag, or paste) and keep the resulting URLs. */
export function useAttachments() {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        if (images.length >= MAX_ATTACHMENTS) break;
        const { url } = await api.uploadImage(file);
        setImages((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, url]));
      }
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [images.length]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    },
    [addFiles],
  );

  const remove = useCallback((url: string) => setImages((prev) => prev.filter((u) => u !== url)), []);
  const clear = useCallback(() => setImages([]), []);

  return { images, uploading, error, addFiles, onPaste, remove, clear };
}
