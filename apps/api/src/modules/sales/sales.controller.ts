import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { SalesService } from "./sales.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";

@UseGuards(JwtAuthGuard)
@Controller("transactions")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTransactionDto) {
    const transaction = await this.salesService.createTransaction(user.business_id, user.sub, dto);
    const receiptBaseUrl = process.env.PUBLIC_RECEIPT_BASE_URL ?? "http://localhost:3000/r";
    return {
      transaction,
      receipt_url: `${receiptBaseUrl}/${transaction.id}`,
    };
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.salesService.getTransactionById(user.business_id, id);
  }
}
