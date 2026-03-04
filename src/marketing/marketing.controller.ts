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
import {
  MarketingOverviewQueryDto,
  MarketingRecommendationRequestDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';
import type { MarketingReportPayload } from './marketing.service';
import { DemoTokenGuard } from '../auth/demo-token.guard';

@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get('overview')
  getOverview(@Query() query: MarketingOverviewQueryDto) {
    return this.marketingService.getOverview(query);
  }

  @Post('recommendations')
  @UseGuards(DemoTokenGuard)
  generateRecommendations(@Body() body: MarketingRecommendationRequestDto) {
    return this.marketingService.generateRecommendations(body);
  }

  @Post('download-report')
  @UseGuards(DemoTokenGuard)
  async downloadReport(
    @Body() payload: MarketingReportPayload,
    @Res() res: Response,
  ) {
    try {
      const buffer = await this.marketingService.generateReport(payload);
      const fileName = `Marketing_Analysis_Report_${new Date().toISOString().split('T')[0]}.docx`;
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
        .json({ error: 'Failed to generate marketing analysis report.' });
    }
  }
}
