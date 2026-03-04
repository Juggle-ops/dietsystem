import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class InventoryQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,}$/i, {
    message: 'storeId should reference a store code (e.g. SH001)',
  })
  storeId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['1', 'true', 'yes'].includes(value.toLowerCase());
    }
    return false;
  })
  @IsBoolean()
  criticalOnly?: boolean;
}
