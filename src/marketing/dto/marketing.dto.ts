import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class MarketingOverviewQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,}$/i, {
    message: 'storeId should reference a store code (e.g. SH001)',
  })
  storeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

export class MarketingRecommendationPreferencesDto {
  @IsOptional()
  @IsIn(['traffic', 'revenue', 'retention'])
  primaryGoal?: 'traffic' | 'revenue' | 'retention';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })
  @IsNumber({ allowNaN: false })
  budgetDelta?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })
  @IsNumber({ allowNaN: false })
  desiredLift?: number;
}

export class MarketingRecommendationRequestDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,}$/i, {
    message: 'storeId should reference a store code (e.g. SH001)',
  })
  storeId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MarketingRecommendationPreferencesDto)
  preferences?: MarketingRecommendationPreferencesDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketingCampaignOverrideDto)
  overrides?: MarketingCampaignOverrideDto[];
}

export class MarketingCampaignOverrideDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })
  @IsNumber({ allowNaN: false })
  actualLift?: number;
}
