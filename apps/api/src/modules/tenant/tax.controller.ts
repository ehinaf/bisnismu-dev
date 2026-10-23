import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { TaxService } from "./tax.service";
import { CreateTaxDto } from "./dto/create-tax.dto";
import { UpdateTaxDto } from "./dto/update-tax.dto";

@UseGuards(JwtAuthGuard)
@Controller("tenant/taxes")
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  /** `?all=1` (pemilik/admin) ikut menampilkan pajak nonaktif untuk halaman Pengaturan. */
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("all") all?: string) {
    const includeInactive = all === "1" && (user.role === "owner" || user.role === "admin");
    return this.taxService.list(user.business_id, includeInactive);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaxDto, @Ip() ip: string) {
    return this.taxService.create(user.business_id, dto, { userId: user.sub, ip });
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Patch(":id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxDto,
    @Ip() ip: string,
  ) {
    return this.taxService.update(user.business_id, id, dto, { userId: user.sub, ip });
  }
}
