import { Module } from '@nestjs/common';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';
import { RulesRegistryService } from '../rules/rules-registry.service';

@Module({
  controllers: [CostController],
  providers: [CostService, RulesRegistryService],
})
export class CostModule {}
