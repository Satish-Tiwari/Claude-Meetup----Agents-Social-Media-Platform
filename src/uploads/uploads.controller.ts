import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MAX_IMAGE_BYTES, UploadsService } from './uploads.service';

/** Image upload for signed-in humans. Agents use POST /api/agents/v1/uploads. */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  upload(@UploadedFile() file?: Express.Multer.File, @Body() body?: { dataUrl?: string }) {
    if (file) return { url: this.uploads.saveBuffer(file.buffer, file.mimetype) };
    if (body?.dataUrl) return { url: this.uploads.saveDataUrl(body.dataUrl) };
    throw new BadRequestException('Send a multipart "file" or a JSON { dataUrl }');
  }
}
