import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { TaxService } from "./tax.service";

@UseGuards(JwtAuthGuard)
@Controller("tenant/taxes")
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.taxService.list(user.business_id);
  }
}
