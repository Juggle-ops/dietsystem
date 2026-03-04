import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SchedulingService } from './scheduling.service';
import type {
  ScheduleRequest,
  PredictDemandRequest,
  OptimizedSchedule,
  StaffMember,
} from './scheduling.service';
import { DemoTokenGuard } from '../auth/demo-token.guard';

type HistoryRequestBody = { limit?: number | string };

type DownloadReportRequest = {
  optimizedSchedule: OptimizedSchedule;
  staffMembers: StaffMember[];
};

type DownloadReportByIdRequest = { id: number | string };

@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post('optimize')
  @UseGuards(DemoTokenGuard)
  optimizeSchedule(@Body() body: ScheduleRequest) {
    return this.schedulingService.optimizeSchedule(body);
  }

  @Post('predict-demand')
  @UseGuards(DemoTokenGuard)
  predictDemand(@Body() body: PredictDemandRequest) {
    return this.schedulingService.predictDemand(body);
  }

  @Post('staff-performance')
  @UseGuards(DemoTokenGuard)
  getStaffPerformance() {
    return this.schedulingService.getStaffPerformance();
  }

  @Post('history')
  @UseGuards(DemoTokenGuard)
  getHistory(@Body() body: HistoryRequestBody = {}) {
    const rawLimit = body?.limit;
    const parsed =
      typeof rawLimit === 'number'
        ? rawLimit
        : typeof rawLimit === 'string'
          ? Number.parseInt(rawLimit, 10)
          : undefined;
    const limit =
      typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
        ? parsed
        : 20;
    return { history: this.schedulingService.getHistory(limit) };
  }

  @Post('download-report')
  @UseGuards(DemoTokenGuard)
  async downloadReport(
    @Body() body: DownloadReportRequest,
    @Res() res: Response,
  ) {
    try {
      const { optimizedSchedule, staffMembers } = body;
      if (!optimizedSchedule || !Array.isArray(staffMembers)) {
        return res
          .status(400)
          .json({ error: 'Missing schedule or staff information.' });
      }

      const buffer = await this.schedulingService.generateWordReport(
        optimizedSchedule,
        staffMembers,
      );

      const fileName = `Staff_Schedule_Report_${
        new Date().toISOString().split('T')[0]
      }.docx`;

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      });

      res.send(buffer);
    } catch (error) {
      console.error('Failed to generate scheduling report:', error);
      res
        .status(500)
        .json({ error: 'Report generation failed, please retry later.' });
    }
  }

  @Post('download-report-by-id')
  @UseGuards(DemoTokenGuard)
  async downloadReportById(
    @Body() body: DownloadReportByIdRequest,
    @Res() res: Response,
  ) {
    try {
      const parsedId =
        typeof body?.id === 'number'
          ? body.id
          : Number.parseInt(String(body?.id ?? 'NaN'), 10);
      if (!Number.isFinite(parsedId)) {
        return res.status(400).json({ error: 'Invalid report identifier.' });
      }
      const item = this.schedulingService.getHistoryItem(parsedId);
      if (!item) {
        return res.status(404).json({ error: 'Report record not found.' });
      }

      const buffer = await this.schedulingService.generateWordReport(
        item.result,
        item.request.staffMembers,
      );
      const fileName = `Staff_Schedule_Report_${
        new Date(item.timestamp).toISOString().split('T')[0]
      }_ID${item.id}.docx`;

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      });
      res.send(buffer);
    } catch (error) {
      console.error('Failed to download scheduling report by id:', error);
      res
        .status(500)
        .json({ error: 'Report generation failed, please retry later.' });
    }
  }
}
