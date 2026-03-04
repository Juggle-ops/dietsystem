import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  EvaluateForecastDto,
  MenuAdjustmentRequestDto,
  SalesForecastRequestDto,
  TrafficForecastRequestDto,
} from './dto/forecast-query.dto';
import { PredictionsService } from './predictions.service';
import { DemoTokenGuard } from '../auth/demo-token.guard';

@Controller('predictions')
export class PredictionsController {
  constructor(private readonly svc: PredictionsService) {}

  @Post('sales')
  @UseGuards(DemoTokenGuard)
  sales(@Body() body: SalesForecastRequestDto) {
    return this.svc.getSalesForecast(body);
  }

  @Post('traffic')
  @UseGuards(DemoTokenGuard)
  traffic(@Body() body: TrafficForecastRequestDto) {
    return this.svc.getTrafficForecast(body);
  }

  @Post('menu-adjustments')
  @UseGuards(DemoTokenGuard)
  menu(@Body() body: MenuAdjustmentRequestDto) {
    return this.svc.getMenuAdjustments(body);
  }

  @Post('evaluate')
  @UseGuards(DemoTokenGuard)
  evaluate(@Body() body: EvaluateForecastDto) {
    return this.svc.evaluateAccuracy(body);
  }
}
