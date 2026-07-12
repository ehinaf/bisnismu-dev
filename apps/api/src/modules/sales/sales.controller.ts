import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { SalesService } from "./sales.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { OpenBillDto } from "./dto/open-bill.dto";
import { AddBillItemsDto } from "./dto/add-bill-items.dto";
import { CloseBillDto } from "./dto/close-bill.dto";

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

  // Rute statis WAJIB di atas rute dinamis ":id" pada kedalaman path yang sama.
  @Post("open")
  @HttpCode(HttpStatus.CREATED)
  openBill(@CurrentUser() user: JwtPayload, @Body() dto: OpenBillDto) {
    return this.salesService.openBill(user.business_id, user.sub, dto);
  }

  @Get("open")
  listOpenBills(@CurrentUser() user: JwtPayload, @Query("outlet_id") outletId: string) {
    return this.salesService.listOpenBills(user.business_id, outletId);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.salesService.getTransactionById(user.business_id, id);
  }

  @Post(":id/items")
  @HttpCode(HttpStatus.CREATED)
  addItems(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AddBillItemsDto) {
    return this.salesService.addBillItems(user.business_id, user.sub, id, dto);
  }

  @Post(":id/close")
  async closeBill(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CloseBillDto) {
    const transaction = await this.salesService.closeBill(user.business_id, user.sub, id, dto);
    const receiptBaseUrl = process.env.PUBLIC_RECEIPT_BASE_URL ?? "http://localhost:3000/r";
    return {
      transaction,
      receipt_url: `${receiptBaseUrl}/${transaction.id}`,
    };
  }
}
