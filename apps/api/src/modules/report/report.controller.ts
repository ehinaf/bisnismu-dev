import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { ReportService } from "./report.service";
import { DateRangeQueryDto } from "./dto/date-range-query.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "admin", "manager")
@Controller("reports")
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get("daily-sales")
  dailySales(@CurrentUser() user: JwtPayload, @Query() query: DateRangeQueryDto) {
    return this.reportService.dailySales(user.business_id, query);
  }

  @Get("top-items")
  topItems(@CurrentUser() user: JwtPayload, @Query() query: DateRangeQueryDto) {
    return this.reportService.topItems(user.business_id, query);
  }

  @Get("payment-methods")
  paymentMethods(@CurrentUser() user: JwtPayload, @Query() query: DateRangeQueryDto) {
    return this.reportService.paymentMethods(user.business_id, query);
  }

  @Get("profit-loss")
  profitLoss(@CurrentUser() user: JwtPayload, @Query() query: DateRangeQueryDto) {
    return this.reportService.profitLoss(user.business_id, query);
  }

  @Get("daily-sales/export")
  async exportDailySales(@CurrentUser() user: JwtPayload, @Query() query: DateRangeQueryDto, @Res() res: Response) {
    const csv = await this.reportService.exportDailySalesCsv(user.business_id, query);
    res.header("Content-Type", "text/csv").attachment("daily-sales.csv").send(csv);
  }

  @Get("expenses/export")
  async exportExpenses(@CurrentUser() user: JwtPayload, @Query() query: DateRangeQueryDto, @Res() res: Response) {
    const csv = await this.reportService.exportExpensesCsv(user.business_id, query);
    res.header("Content-Type", "text/csv").attachment("expenses.csv").send(csv);
  }
}
