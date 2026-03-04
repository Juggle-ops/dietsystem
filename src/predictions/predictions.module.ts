import { Module } from '@nestjs/common';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { RulesRegistryService } from '../rules/rules-registry.service';

@Module({
  controllers: [PredictionsController],
  providers: [PredictionsService, RulesRegistryService],
})
export class PredictionsModule {}
