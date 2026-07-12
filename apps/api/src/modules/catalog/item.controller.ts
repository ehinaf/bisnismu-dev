import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { ItemService } from "./item.service";
import { VariantService } from "./variant.service";
import { PriceTierService } from "./price-tier.service";
import { ItemModifierGroupService } from "./item-modifier-group.service";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { CreatePriceTierDto } from "./dto/create-price-tier.dto";
import { UpdatePriceTierDto } from "./dto/update-price-tier.dto";

@UseGuards(JwtAuthGuard)
@Controller("catalog/items")
export class ItemController {
  constructor(
    private readonly itemService: ItemService,
    private readonly variantService: VariantService,
    private readonly priceTierService: PriceTierService,
    private readonly itemModifierGroupService: ItemModifierGroupService,
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

  @Get(":id/price-tiers")
  listPriceTiers(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.priceTierService.list(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post(":id/price-tiers")
  createPriceTier(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CreatePriceTierDto) {
    return this.priceTierService.create(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id/price-tiers/:tierId")
  updatePriceTier(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("tierId") tierId: string,
    @Body() dto: UpdatePriceTierDto,
  ) {
    return this.priceTierService.update(user.business_id, id, tierId, dto);
  }

  @Get(":id/modifier-groups")
  listModifierGroups(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.itemModifierGroupService.list(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post(":id/modifier-groups/:groupId")
  attachModifierGroup(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("groupId") groupId: string) {
    return this.itemModifierGroupService.attach(user.business_id, id, groupId);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Delete(":id/modifier-groups/:groupId")
  detachModifierGroup(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("groupId") groupId: string) {
    return this.itemModifierGroupService.detach(user.business_id, id, groupId);
  }
}
