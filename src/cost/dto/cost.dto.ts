import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CostOverviewQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,}$/i, {
    message: 'storeId should reference a store code (e.g. SH001)',
  })
  storeId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })
  @Min(1)
  @Max(90)
  windowDays?: number;
}
