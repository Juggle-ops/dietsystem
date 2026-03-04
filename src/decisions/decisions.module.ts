import { Module } from '@nestjs/common';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';
import { RulesRegistryService } from '../rules/rules-registry.service';

@Module({
  controllers: [DecisionsController],
  providers: [DecisionsService, RulesRegistryService],
})
export class DecisionsModule {}
