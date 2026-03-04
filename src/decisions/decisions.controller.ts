import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { DecisionOverviewQueryDto } from './dto/decisions.dto';
import { DecisionsService } from './decisions.service';
import type {
  DecisionReportPayload,
  DecisionSimulationRequest,
} from './decisions.service';
import { DemoTokenGuard } from '../auth/demo-token.guard';

@Controller('decisions')
export class DecisionsController {
  constructor(private readonly decisionsService: DecisionsService) {}

  @Get('overview')
  getOverview(@Query() query: DecisionOverviewQueryDto) {
    return this.decisionsService.getOverview(query);
  }

  @Post('simulate')
  @UseGuards(DemoTokenGuard)
  simulate(@Body() body: DecisionSimulationRequest) {
    return this.decisionsService.simulate(body);
  }

  @Post('history')
  @UseGuards(DemoTokenGuard)
  history(@Body('limit') limit?: number) {
    const numericLimit =
      typeof limit === 'number' && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : 20;
    return {
      history: this.decisionsService.getSimulationHistory(numericLimit),
    };
  }

  @Post('download-report')
  @UseGuards(DemoTokenGuard)
  async downloadReport(
    @Body() payload: DecisionReportPayload,
    @Res() res: Response,
  ) {
    try {
      const buffer = await this.decisionsService.generateReport(payload);
      const fileName = `Decision_Simulation_Report_${new Date().toISOString().split('T')[0]}.docx`;
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      });
      res.send(buffer);
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to generate decision simulation report.' });
    }
  }

  @Post('download-report-by-id')
  @UseGuards(DemoTokenGuard)
  async downloadReportById(
    @Body('id') rawId: number | string,
    @Res() res: Response,
  ) {
    const id =
      typeof rawId === 'number'
        ? rawId
        : Number.parseInt(String(rawId ?? ''), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid simulation identifier.' });
    }
    const item = this.decisionsService.getHistoryItem(id);
    if (!item) {
      return res.status(404).json({ error: 'Simulation record not found.' });
    }
    try {
      const buffer = await this.decisionsService.generateReport({
        inputParams: item.input,
        scenarios: item.result.scenarios,
        recommendation: item.result.recommendation,
        metrics: item.result.metrics,
      });
      const fileName = `Decision_Simulation_Report_${new Date(item.timestamp).toISOString().split('T')[0]}_ID${item.id}.docx`;
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      });
      res.send(buffer);
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Failed to generate decision simulation report.' });
    }
  }
}
