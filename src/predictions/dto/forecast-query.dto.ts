import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  IsISO8601,
} from 'class-validator';

export class ForecastQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,}$/i, {
    message: 'storeId should reference a store code (e.g. SH001)',
  })
  storeId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  targetDate?: string;
}

export class SalesOverrideItemDto {
  @IsString()
  ingredient!: string;

  @IsOptional()
  @IsString()
  unit?: string;

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
  currentStock?: number;
}

export class SalesForecastRequestDto extends ForecastQueryDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOverrideItemDto)
  @ArrayMinSize(1)
  items?: SalesOverrideItemDto[];
}

export class TrafficForecastRequestDto extends ForecastQueryDto {}

export class MenuItemInputDto {
  @IsString()
  ingredient!: string;

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
  margin?: number;

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
  risk?: number;

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
  stock?: number;
}

export class MenuAdjustmentRequestDto extends ForecastQueryDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemInputDto)
  items?: MenuItemInputDto[];
}

export class EvaluateForecastDto {
  @IsArray()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  actual!: number[];

  @IsArray()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  predicted!: number[];
}
