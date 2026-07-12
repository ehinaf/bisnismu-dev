import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { ItemService } from "./item.service";
import { VariantService } from "./variant.service";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";

@UseGuards(JwtAuthGuard)
@Controller("catalog/items")
export class ItemController {
  constructor(
    private readonly itemService: ItemService,
    private readonly variantService: VariantService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.itemService.list(user.business_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.itemService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateItemDto) {
    return this.itemService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateItemDto) {
    return this.itemService.update(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.itemService.softDelete(user.business_id, id);
  }

  @Get(":id/variants")
  listVariants(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.variantService.list(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post(":id/variants")
  createVariant(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CreateVariantDto) {
    return this.variantService.create(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id/variants/:variantId")
  updateVariant(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variantService.update(user.business_id, id, variantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Delete(":id/variants/:variantId")
  removeVariant(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("variantId") variantId: string) {
    return this.variantService.softDelete(user.business_id, id, variantId);
  }
}
