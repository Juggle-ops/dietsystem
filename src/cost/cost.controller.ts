import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CostOverviewQueryDto } from './dto/cost.dto';
import { CostService } from './cost.service';
import type { CostReportPayload } from './cost.service';
import { DemoTokenGuard } from '../auth/demo-token.guard';

@Controller('cost')
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get('overview')
  getOverview(@Query() query: CostOverviewQueryDto) {
    return this.costService.getOverview(query);
  }

  @Post('download-report')
  @UseGuards(DemoTokenGuard)
  async downloadReport(
    @Body() payload: CostReportPayload,
    @Res() res: Response,
  ) {
    try {
      const buffer = await this.costService.generateReport(payload);
      const fileName = `Cost_Analytics_Report_${new Date().toISOString().split('T')[0]}.docx`;

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      });

      res.send(buffer);
    } catch (error) {
      res
        .status(500)
        .json({ error: 'Failed to generate cost analytics report.' });
    }
  }
}
