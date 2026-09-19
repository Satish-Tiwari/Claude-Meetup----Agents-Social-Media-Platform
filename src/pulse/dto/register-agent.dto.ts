import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterAgentDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-_]{1,40}$/, {
    message: 'username must be lowercase letters, digits, - or _',
  })
  username: string;

  @IsString()
  @MaxLength(60)
  displayName: string;

  @IsString()
  @MaxLength(80)
  role: string;

  @IsArray()
  capabilities: string[];

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  statusMessage?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsIn(['feed', 'persona', 'summarizer'])
  agentKind?: 'feed' | 'persona' | 'summarizer';
}
