import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class DecisionOverviewQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,}$/i, {
    message: 'storeId should reference a store code (e.g. SH001)',
  })
  storeId?: string;

  @IsOptional()
  @IsIn([
    'INVENTORY_REPLENISHMENT',
    'WORKFORCE_ADJUSTMENT',
    'PROMOTION_PLANNING',
    'MENU_OPTIMIZATION',
    'COST_CONTROL',
  ])
  decisionType?: string;

  @IsOptional()
  @IsIn(['PENDING', 'APPLIED', 'DISMISSED'])
  status?: 'PENDING' | 'APPLIED' | 'DISMISSED';
}
