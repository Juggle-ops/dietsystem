import { Injectable } from '@nestjs/common';
import * as docx from 'docx';
import {
  buildStandardStyles,
  buildHeaderFooter,
  buildBarChartTable,
} from '../reports/report-utils';

export interface StaffMember {
  id: number;
  name: string;
  position: string;
  level: '初级' | '中级' | '高级';
  skills: string[];
  performance: number;
  availability: '全时' | '兼职';
  hourlyRate: number;
  status: 'active' | 'inactive';
  maxHoursPerWeek: number;
  preferredShifts: string[];
}

export interface Shift {
  id: string;
  time: string;
  type: 'breakfast' | 'lunch' | 'dinner';
  duration: number; // hours
  requiredSkills: string[];
  minStaff: number;
  maxStaff: number;
  predictedDemand: number;
}

export interface ScheduleConstraints {
  maxOvertimeHours?: number;
  minRestHours?: number;
  maxConsecutiveDays?: number;
}

export interface ScheduleRequest {
  week: string;
  staffMembers: StaffMember[];
  shifts: Shift[];
  constraints?: ScheduleConstraints;
}

export type DemandTimeSlot = 'morning' | 'afternoon' | 'evening';

export interface PredictDemandRequest {
  date: string;
  timeSlot: DemandTimeSlot;
}

export interface OptimizedSchedule {
  week: string;
  dailySchedules: {
    date: string;
    day: string;
    shifts: {
      shiftId: string;
      time: string;
      type: string;
      assignedStaff: {
        staffId: number;
        name: string;
        position: string;
        hourlyRate: number;
      }[];
      predictedDemand: number;
      coverage: number;
      cost: number;
    }[];
    totalCost: number;
    totalCoverage: number;
  }[];
  summary: {
    totalCost: number;
    totalHours: number;
    averageCoverage: number;
    costSavings: number;
    efficiency: number;
    recommendations: string[];
  };
}

@Injectable()
export class SchedulingService {
  private history: Array<{
    id: number;
    timestamp: string;
    request: ScheduleRequest;
    result: OptimizedSchedule;
  }> = [];
  private nextHistoryId = 1;
  // 基础排班数据
  private readonly baseShifts: Shift[] = [
    {
      id: 'morning',
      time: '09:00-17:00',
      type: 'breakfast',
      duration: 8,
      requiredSkills: ['客户服务', '收银'],
      minStaff: 2,
      maxStaff: 4,
      predictedDemand: 70,
    },
    {
      id: 'evening',
      time: '17:00-22:00',
      type: 'dinner',
      duration: 5,
      requiredSkills: ['客户服务', '收银'],
      minStaff: 2,
      maxStaff: 3,
      predictedDemand: 85,
    },
  ];

  optimizeSchedule(req: ScheduleRequest): OptimizedSchedule {
    const { week, staffMembers, shifts = this.baseShifts } = req;

    // 生成一周的排班
    const dailySchedules = this.generateWeeklySchedule(
      week,
      staffMembers,
      shifts,
    );

    // 计算总体统计
    const summary = this.calculateSummary(dailySchedules, staffMembers);

    const result: OptimizedSchedule = {
      week,
      dailySchedules,
      summary,
    };
    // 保存历史记录（最多100条）
    this.history.unshift({
      id: this.nextHistoryId++,
      timestamp: new Date().toISOString(),
      request: req,
      result,
    });
    this.history = this.history.slice(0, 100);
    return result;
  }

  getHistory(limit = 20) {
    return this.history.slice(0, limit);
  }

  getHistoryItem(id: number) {
    return this.history.find((h) => h.id === id);
  }

  private generateWeeklySchedule(
    week: string,
    staffMembers: StaffMember[],
    shifts: Shift[],
  ): OptimizedSchedule['dailySchedules'] {
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const dailySchedules: OptimizedSchedule['dailySchedules'] = [];

    for (let i = 0; i < 7; i++) {
      const date = this.getDateForDay(week, i);
      const daySchedule = this.optimizeDaySchedule(
        date,
        days[i],
        staffMembers,
        shifts,
      );
      dailySchedules.push(daySchedule);
    }

    return dailySchedules;
  }

  private optimizeDaySchedule(
    date: string,
    day: string,
    staffMembers: StaffMember[],
    shifts: Shift[],
  ): OptimizedSchedule['dailySchedules'][0] {
    const dayShifts = shifts.map((shift) => {
      // 根据预测需求调整所需人员
      const adjustedMinStaff = Math.ceil(
        shift.minStaff * (shift.predictedDemand / 100),
      );
      const adjustedMaxStaff = Math.min(
        shift.maxStaff,
        Math.ceil(shift.maxStaff * (shift.predictedDemand / 100)),
      );

      // 选择最优员工组合
      const assignedStaff = this.selectOptimalStaff(
        staffMembers,
        shift,
        adjustedMinStaff,
        adjustedMaxStaff,
      );

      const cost = assignedStaff.reduce(
        (sum, staff) => sum + staff.hourlyRate * shift.duration,
        0,
      );
      const coverage = (assignedStaff.length / adjustedMaxStaff) * 100;

      return {
        shiftId: shift.id,
        time: shift.time,
        type: shift.type,
        assignedStaff,
        predictedDemand: shift.predictedDemand,
        coverage,
        cost,
      };
    });

    const totalCost = dayShifts.reduce((sum, shift) => sum + shift.cost, 0);
    const totalCoverage =
      dayShifts.reduce((sum, shift) => sum + shift.coverage, 0) /
      dayShifts.length;

    return {
      date,
      day,
      shifts: dayShifts,
      totalCost,
      totalCoverage,
    };
  }

  private selectOptimalStaff(
    staffMembers: StaffMember[],
    shift: Shift,
    minStaff: number,
    maxStaff: number,
  ): OptimizedSchedule['dailySchedules'][0]['shifts'][0]['assignedStaff'] {
    // 过滤可用员工
    const availableStaff = staffMembers.filter(
      (staff) =>
        staff.status === 'active' &&
        this.hasRequiredSkills(staff, shift.requiredSkills),
    );

    // 按效率和成本排序
    const sortedStaff = availableStaff.sort((a, b) => {
      // 优先考虑效率高的员工
      const efficiencyScoreA = a.performance / a.hourlyRate;
      const efficiencyScoreB = b.performance / b.hourlyRate;
      return efficiencyScoreB - efficiencyScoreA;
    });

    // 选择最优组合
    const selectedStaff = sortedStaff.slice(
      0,
      Math.min(maxStaff, sortedStaff.length),
    );

    // 确保满足最少人员要求
    if (selectedStaff.length < minStaff) {
      // 如果可用员工不足，选择所有可用员工
      return selectedStaff.map((staff) => ({
        staffId: staff.id,
        name: staff.name,
        position: staff.position,
        hourlyRate: staff.hourlyRate,
      }));
    }

    return selectedStaff.map((staff) => ({
      staffId: staff.id,
      name: staff.name,
      position: staff.position,
      hourlyRate: staff.hourlyRate,
    }));
  }

  private hasRequiredSkills(
    staff: StaffMember,
    requiredSkills: string[],
  ): boolean {
    return requiredSkills.every((skill) => staff.skills.includes(skill));
  }

  private calculateSummary(
    dailySchedules: OptimizedSchedule['dailySchedules'],
    staffMembers: StaffMember[],
  ): OptimizedSchedule['summary'] {
    const totalCost = dailySchedules.reduce(
      (sum, day) => sum + day.totalCost,
      0,
    );
    const totalHours = dailySchedules.reduce(
      (sum, day) =>
        sum +
        day.shifts.reduce(
          (shiftSum, shift) => shiftSum + shift.assignedStaff.length * 8,
          0,
        ),
      0,
    );

    const averageCoverage =
      dailySchedules.reduce((sum, day) => sum + day.totalCoverage, 0) /
      dailySchedules.length;

    // 计算成本节省（与基准排班对比）
    const baselineCost = this.calculateBaselineCost(staffMembers);
    const costSavings = ((baselineCost - totalCost) / baselineCost) * 100;

    // 计算效率
    const efficiency = (averageCoverage * (100 - Math.abs(costSavings))) / 100;

    // 生成建议
    const recommendations = this.generateRecommendations(
      dailySchedules,
      costSavings,
      averageCoverage,
    );

    return {
      totalCost,
      totalHours,
      averageCoverage,
      costSavings: Math.max(0, costSavings),
      efficiency,
      recommendations,
    };
  }

  private calculateBaselineCost(staffMembers: StaffMember[]): number {
    // 基准成本：假设每天都有固定人员排班
    const dailyBaselineCost = staffMembers
      .filter((staff) => staff.status === 'active')
      .reduce((sum, staff) => sum + staff.hourlyRate * 8, 0);

    return dailyBaselineCost * 7; // 一周
  }

  private generateRecommendations(
    dailySchedules: OptimizedSchedule['dailySchedules'],
    costSavings: number,
    averageCoverage: number,
  ): string[] {
    const recommendations: string[] = [];

    if (costSavings > 10) {
      recommendations.push(
        `当前排班方案可节省${costSavings.toFixed(1)}%的人力成本`,
      );
    }

    if (averageCoverage > 90) {
      recommendations.push('人员配置充足，服务质量有保障');
    } else if (averageCoverage < 80) {
      recommendations.push('建议增加人员配置，避免服务质量下降');
    }

    // 分析高峰时段
    const peakShifts = dailySchedules.flatMap((day) =>
      day.shifts.filter((shift) => shift.predictedDemand > 80),
    );

    if (peakShifts.length > 0) {
      recommendations.push('高峰时段人员配置已优化，建议保持');
    }

    // 分析成本效率
    const avgCostPerHour =
      dailySchedules.reduce(
        (sum, day) =>
          sum +
          day.shifts.reduce(
            (shiftSum, shift) =>
              shiftSum + shift.cost / shift.assignedStaff.length,
            0,
          ),
        0,
      ) / dailySchedules.length;

    if (avgCostPerHour < 200) {
      recommendations.push('成本控制良好，效率较高');
    }

    return recommendations;
  }

  private getDateForDay(week: string, dayIndex: number): string {
    // 简化实现，实际应该根据week参数计算具体日期
    const baseDate = new Date('2024-01-15');
    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + dayIndex);
    return targetDate.toISOString().split('T')[0];
  }

  predictDemand(request: PredictDemandRequest) {
    const { date, timeSlot } = request;
    const parsedDate = new Date(date);
    const effectiveDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;

    const baseDemand = 70;
    const dayOfWeek = effectiveDate.getDay();
    const slotMultiplierMap: Record<DemandTimeSlot, number> = {
      morning: 1.0,
      afternoon: 1.1,
      evening: 1.2,
    };
    const timeMultiplier = slotMultiplierMap[timeSlot] ?? 1.0;
    const dayMultiplier = dayOfWeek === 0 || dayOfWeek >= 5 ? 1.3 : 1.0;

    const predictedDemand = Math.min(
      100,
      Math.round(baseDemand * timeMultiplier * dayMultiplier),
    );

    return {
      date: effectiveDate.toISOString().split('T')[0],
      timeSlot,
      predictedDemand,
      confidence: 85,
      factors: [
        { factor: 'Historical pattern', impact: 40 },
        { factor: 'Weather outlook', impact: 20 },
        { factor: 'Seasonality', impact: 15 },
        { factor: 'Nearby events', impact: 25 },
      ],
    };
  }

  getStaffPerformance() {
    // 员工绩效分析
    return {
      performanceMetrics: [
        { metric: '工作效率', value: 94, trend: '+3.2%' },
        { metric: '客户满意度', value: 95, trend: '+2.1%' },
        { metric: '出勤率', value: 98, trend: '+1.5%' },
        { metric: '技能提升', value: 87, trend: '+5.8%' },
      ],
      topPerformers: [
        { name: '赵小美', score: 95, improvement: '+8%' },
        { name: '张小明', score: 92, improvement: '+5%' },
        { name: '李小红', score: 88, improvement: '+3%' },
      ],
      improvementAreas: [
        { area: '团队协作', priority: 'high', impact: 'medium' },
        { area: '技能培训', priority: 'medium', impact: 'high' },
        { area: '客户服务', priority: 'low', impact: 'high' },
      ],
    };
  }

  async generateWordReport(
    optimizedSchedule: OptimizedSchedule,
    staffMembers: StaffMember[],
  ): Promise<Buffer> {
    try {
      const { header, footer } = buildHeaderFooter({
        systemName: '氢云餐饮 · 智能系统',
        reportName: '智能排班优化报告',
      });
      const summary = optimizedSchedule?.summary ?? {
        totalCost: 0,
        totalHours: 0,
        averageCoverage: 0,
        costSavings: 0,
        efficiency: 0,
        recommendations: [],
      };
      const dailySchedules = Array.isArray(optimizedSchedule?.dailySchedules)
        ? optimizedSchedule.dailySchedules
        : [];
      const recommendations = Array.isArray(summary.recommendations)
        ? summary.recommendations
        : [];
      const generationTime = new Date();

      const toNumber = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) ? value : 0;

      const toCurrency = (value: unknown) =>
        '¥' +
        toNumber(value).toLocaleString('zh-CN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const toPercent = (value: unknown, digits = 1) =>
        toNumber(value).toFixed(digits) + '%';

      const toHoursText = (value: unknown) =>
        toNumber(value).toFixed(1) + ' 小时';

      const makeDayLabel = (day: { day?: string; date?: string }) => {
        if (day.day && day.date) {
          return day.day + ' ' + day.date;
        }
        return day.day ?? day.date ?? '未知';
      };

      const totalCost = toNumber(summary.totalCost);
      const totalHours = toNumber(summary.totalHours);
      const averageCoverage = toNumber(summary.averageCoverage);
      const costSavingsPercent = toNumber(summary.costSavings);
      const efficiencyPercent = toNumber(summary.efficiency);

      const savingsRatio = Math.min(
        Math.max(costSavingsPercent / 100, 0),
        0.99,
      );
      const baselineCost =
        savingsRatio < 1 ? totalCost / (1 - savingsRatio) : totalCost;
      const scheduleDays = Math.max(dailySchedules.length, 1);
      const baselineDailyCost = baselineCost / scheduleDays;
      const optimizedDailyCost = totalCost / scheduleDays;

      const coverageSeries = dailySchedules.map((day) => ({
        label: makeDayLabel(day),
        value:
          typeof day.totalCoverage === 'number' &&
          Number.isFinite(day.totalCoverage)
            ? Math.max(0, Math.min(day.totalCoverage, 100))
            : 0,
      }));
      const costSeries = dailySchedules.map((day) => ({
        label: makeDayLabel(day),
        value:
          typeof day.totalCost === 'number' && Number.isFinite(day.totalCost)
            ? Math.max(0, day.totalCost)
            : 0,
      }));

      const sections: Array<docx.Paragraph | docx.Table> = [];

      sections.push(
        new docx.Paragraph({
          text: '智能排班优化报告',
          heading: docx.HeadingLevel.TITLE,
          alignment: docx.AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
      );
      sections.push(
        new docx.Paragraph({
          text:
            '生成时间：' +
            generationTime.toLocaleString('zh-CN', { hour12: false }),
          alignment: docx.AlignmentType.CENTER,
          spacing: { after: 300 },
        }),
      );

      sections.push(
        new docx.Paragraph({
          text: '一、运营摘要',
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 160 },
        }),
      );
      const summaryBullets = [
        '周总成本：' + toCurrency(totalCost),
        '总工时：' + toHoursText(totalHours),
        '平均覆盖率：' + toPercent(averageCoverage),
        '成本节省潜力：' + toPercent(costSavingsPercent),
        '效率评分：' + toPercent(efficiencyPercent),
      ];
      summaryBullets.forEach((item) =>
        sections.push(
          new docx.Paragraph({
            text: item,
            bullet: { level: 0 },
          }),
        ),
      );

      if (coverageSeries.some((item) => item.value > 0)) {
        sections.push(
          new docx.Paragraph({
            text: '绩效覆盖率趋势',
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 160 },
          }),
        );
        sections.push(
          buildBarChartTable(coverageSeries, {
            unit: '%',
            maxValue: 100,
            decimals: 1,
          }),
        );
      } else {
        sections.push(
          new docx.Paragraph({
            text: '暂无排班覆盖率数据。',
            style: 'SmallNote',
          }),
        );
      }

      if (costSeries.some((item) => item.value > 0)) {
        sections.push(
          new docx.Paragraph({
            text: '人力成本走势',
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 160 },
          }),
        );
        sections.push(
          buildBarChartTable(costSeries, { unit: '¥', decimals: 0 }),
        );
      }

      sections.push(
        new docx.Paragraph({
          text: '二、优化前后成本对比',
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 160 },
        }),
      );
      sections.push(
        new docx.Table({
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  children: [new docx.Paragraph('项目')],
                  shading: { fill: 'EEF2FF' },
                }),
                new docx.TableCell({
                  children: [new docx.Paragraph('传统排班')],
                  shading: { fill: 'EEF2FF' },
                }),
                new docx.TableCell({
                  children: [new docx.Paragraph('AI 优化')],
                  shading: { fill: 'EEF2FF' },
                }),
              ],
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  children: [new docx.Paragraph('周总成本')],
                }),
                new docx.TableCell({
                  children: [new docx.Paragraph(toCurrency(baselineCost))],
                }),
                new docx.TableCell({
                  children: [new docx.Paragraph(toCurrency(totalCost))],
                }),
              ],
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  children: [new docx.Paragraph('平均日成本')],
                }),
                new docx.TableCell({
                  children: [new docx.Paragraph(toCurrency(baselineDailyCost))],
                }),
                new docx.TableCell({
                  children: [new docx.Paragraph(toCurrency(optimizedDailyCost))],
                }),
              ],
            }),
          ],
        }),
      );

      sections.push(
        new docx.Paragraph({
          text: '三、员工排班详情',
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 160 },
        }),
      );
      if (dailySchedules.length === 0) {
        sections.push(
          new docx.Paragraph({
            text: '当前周暂无排班数据。',
            style: 'SmallNote',
          }),
        );
      } else {
        dailySchedules.forEach((day) => {
          const shifts = Array.isArray(day.shifts) ? day.shifts : [];
          sections.push(
            new docx.Paragraph({
              text:
                makeDayLabel(day) +
                ' · 覆盖率 ' +
                toPercent(day.totalCoverage) +
                ' · 成本 ' +
                toCurrency(day.totalCost),
              heading: docx.HeadingLevel.HEADING_2,
              spacing: { before: 120, after: 80 },
            }),
          );
          const shiftRows = shifts.map((shift) => [
            shift.type ?? '未分类',
            shift.time ?? '—',
            (Array.isArray(shift.assignedStaff) ? shift.assignedStaff : [])
              .map((staff) => staff.name)
              .join('、') || '未分配',
            toCurrency(shift.cost),
          ]);
          sections.push(
            new docx.Table({
              width: { size: 100, type: docx.WidthType.PERCENTAGE },
              rows: [
                new docx.TableRow({
                  children: [
                    new docx.TableCell({
                      children: [new docx.Paragraph('班次')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph('时间')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph('人员配置')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph('成本')],
                    }),
                  ],
                }),
                ...shiftRows.map(
                  (row) =>
                    new docx.TableRow({
                      children: row.map(
                        (cell) =>
                          new docx.TableCell({
                            children: [new docx.Paragraph(cell)],
                          }),
                      ),
                    }),
                ),
              ],
            }),
          );
        });
      }

      sections.push(
        new docx.Paragraph({
          text: '四、AI 优化建议',
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 160 },
        }),
      );
      if (recommendations.length) {
        recommendations.forEach((item, index) =>
          sections.push(
            new docx.Paragraph({
              text: String(index + 1) + '. ' + item,
              bullet: { level: 0 },
            }),
          ),
        );
      } else {
        sections.push(
          new docx.Paragraph({
            text: '暂无额外建议，建议持续监控次周数据。',
            style: 'SmallNote',
          }),
        );
      }

      sections.push(
        new docx.Paragraph({
          text: '五、参与排班的员工信息',
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 160 },
        }),
      );
      const normalizedStaff = Array.isArray(staffMembers) ? staffMembers : [];
      if (normalizedStaff.length) {
        sections.push(
          new docx.Table({
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
            rows: [
              new docx.TableRow({
                children: [
                  new docx.TableCell({
                    children: [new docx.Paragraph('姓名')],
                  }),
                  new docx.TableCell({
                    children: [new docx.Paragraph('职位')],
                  }),
                  new docx.TableCell({
                    children: [new docx.Paragraph('级别')],
                  }),
                  new docx.TableCell({
                    children: [new docx.Paragraph('时薪')],
                  }),
                  new docx.TableCell({
                    children: [new docx.Paragraph('核心技能')],
                  }),
                ],
              }),
              ...normalizedStaff.map((staff) =>
                new docx.TableRow({
                  children: [
                    new docx.TableCell({
                      children: [new docx.Paragraph(staff.name)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(staff.position)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(staff.level)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(toCurrency(staff.hourlyRate))],
                    }),
                    new docx.TableCell({
                      children: [
                        new docx.Paragraph(
                          Array.isArray(staff.skills) && staff.skills.length
                            ? staff.skills.join('、')
                            : '—',
                        ),
                      ],
                    }),
                  ],
                }),
              ),
            ],
          }),
        );
      } else {
        sections.push(
          new docx.Paragraph({
            text: '暂无员工数据，请确认排班请求是否包含有效信息。',
            style: 'SmallNote',
          }),
        );
      }

      sections.push(
        new docx.Paragraph({
          text: '—— 报告结束 ——',
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 360 },
        }),
      );

      const document = new docx.Document({
        styles: buildStandardStyles(),
        sections: [
          {
            headers: { default: header },
            footers: { default: footer },
            children: sections,
          },
        ],
      });

      return await docx.Packer.toBuffer(document);
    } catch (error) {
      console.error('生成Word报告失败:', error);
      throw new Error('生成Word报告失败');
    }
  }
}
