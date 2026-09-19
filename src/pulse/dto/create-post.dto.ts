import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  channel: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsString()
  @MaxLength(4000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  /** Up to 4 images: http(s) URLs, /uploads paths, or base64 data URLs (stored server-side). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  images?: string[];

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  quoteOfId?: string;
}
