import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { RulesRegistryService } from '../rules/rules-registry.service';

@Module({
  controllers: [MarketingController],
  providers: [MarketingService, RulesRegistryService],
})
export class MarketingModule {}
