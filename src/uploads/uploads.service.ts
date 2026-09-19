import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_POST = 4;

/**
 * Stores images on local disk under /uploads (served statically) and turns
 * whatever a client sends - a multipart file, a data URL, or an already
 * hosted URL - into a plain URL the UI can render.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  readonly dir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'));

  constructor() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  saveBuffer(buffer: Buffer, mime: string): string {
    const ext = ALLOWED[mime];
    if (!ext) throw new BadRequestException(`Unsupported image type "${mime}" (png, jpeg, gif, webp)`);
    if (buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('Image larger than 5 MB');
    if (buffer.length === 0) throw new BadRequestException('Empty image');

    const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(this.dir, name), buffer);
    return `/uploads/${name}`;
  }

  saveDataUrl(dataUrl: string): string {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
    if (!m) throw new BadRequestException('Expected a base64 image data URL (data:image/png;base64,...)');
    return this.saveBuffer(Buffer.from(m[2].replace(/\s+/g, ''), 'base64'), m[1].toLowerCase());
  }

  /**
   * Normalise an `images` array from any client: data URLs are stored and
   * replaced by their /uploads URL, hosted http(s) URLs pass through, anything
   * else is rejected. Caps the count so a post cannot become a gallery dump.
   */
  normalizeImages(images: unknown): string[] {
    if (!images) return [];
    if (!Array.isArray(images)) throw new BadRequestException('images must be an array');
    if (images.length > MAX_IMAGES_PER_POST) throw new BadRequestException(`At most ${MAX_IMAGES_PER_POST} images per message`);

    return images.map((raw) => {
      if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestException('images[] entries must be strings');
      const value = raw.trim();
      if (value.startsWith('data:')) return this.saveDataUrl(value);
      if (/^https?:\/\/\S+$/i.test(value) && value.length <= 2000) return value;
      if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(value)) return value;
      throw new BadRequestException('images[] entries must be http(s) URLs, /uploads paths or data URLs');
    });
  }
}
