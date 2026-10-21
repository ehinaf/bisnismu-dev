import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions/permissions";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { SalesService } from "./sales.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { OpenBillDto } from "./dto/open-bill.dto";
import { AddBillItemsDto } from "./dto/add-bill-items.dto";
import { CloseBillDto } from "./dto/close-bill.dto";
import { QuoteTransactionDto } from "./dto/quote-transaction.dto";
import { QuoteBillDto } from "./dto/quote-bill.dto";
import { ListTransactionsQueryDto } from "./dto/list-transactions-query.dto";
import { VoidTransactionDto } from "./dto/void-transaction.dto";
import { RefundQuoteDto, RefundTransactionDto } from "./dto/refund-transaction.dto";

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
  // Pratinjau total keranjang (diskon otomatis, voucher, pajak, pembulatan) tanpa menyimpan.
  @Post("quote")
  @HttpCode(HttpStatus.OK)
  quote(@CurrentUser() user: JwtPayload, @Body() dto: QuoteTransactionDto) {
    return this.salesService.quoteTransaction(user.business_id, dto);
  }

  @Post("open")
  @HttpCode(HttpStatus.CREATED)
  openBill(@CurrentUser() user: JwtPayload, @Body() dto: OpenBillDto) {
    return this.salesService.openBill(user.business_id, user.sub, dto);
  }

  // Riwayat penjualan satu hari (default hari ini) untuk halaman Riwayat.
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListTransactionsQueryDto) {
    return this.salesService.listTransactions(user.business_id, query.outlet_id, query.date);
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

  // Pratinjau total open bill bila ditutup sekarang — tampilkan sebelum input pembayaran.
  @Post(":id/quote")
  @HttpCode(HttpStatus.OK)
  quoteBill(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: QuoteBillDto) {
    return this.salesService.quoteBill(user.business_id, id, dto);
  }

  // Void penjualan selesai (shift lacinya masih buka) atau batalkan open bill.
  @Post(":id/void")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermission(PERMISSIONS.VOID_TRANSACTION)
  voidTransaction(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VoidTransactionDto,
    @Ip() ip: string,
  ) {
    return this.salesService.voidTransaction(user.business_id, id, dto.reason, { userId: user.sub, ip });
  }

  @Get(":id/refundable")
  @UseGuards(PermissionsGuard)
  @RequirePermission(PERMISSIONS.REFUND_TRANSACTION)
  refundable(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.salesService.refundableLines(user.business_id, id);
  }

  // Pratinjau refund (angka server) untuk dialog refund — tidak menyimpan apa pun.
  @Post(":id/refund/quote")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermission(PERMISSIONS.REFUND_TRANSACTION)
  quoteRefund(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RefundQuoteDto) {
    return this.salesService.quoteRefund(user.business_id, id, dto);
  }

  // Refund sebagian/penuh — juga untuk transaksi dari shift yang sudah ditutup.
  @Post(":id/refund")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermission(PERMISSIONS.REFUND_TRANSACTION)
  refund(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RefundTransactionDto,
    @Ip() ip: string,
  ) {
    return this.salesService.refundTransaction(user.business_id, id, dto, { userId: user.sub, ip });
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
