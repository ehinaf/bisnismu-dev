import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { CustomerService } from "./customer.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { CreateReceivablePaymentDto } from "./dto/create-receivable-payment.dto";

@UseGuards(JwtAuthGuard)
@Controller("customers")
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.customerService.list(user.business_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.customerService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCustomerDto) {
    return this.customerService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customerService.update(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.customerService.softDelete(user.business_id, id);
  }

  @Get(":id/receivables")
  getReceivables(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.customerService.getReceivables(user.business_id, id);
  }

  @Post(":id/receivables/:receivableId/payments")
  addReceivablePayment(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("receivableId") receivableId: string,
    @Body() dto: CreateReceivablePaymentDto,
  ) {
    return this.customerService.addReceivablePayment(user.business_id, id, receivableId, user.sub, dto);
  }
}
