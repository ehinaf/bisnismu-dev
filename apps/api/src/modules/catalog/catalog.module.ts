import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller";
import { CategoryService } from "./category.service";
import { UnitController } from "./unit.controller";
import { UnitService } from "./unit.service";
import { ItemController } from "./item.controller";
import { ItemService } from "./item.service";
import { VariantService } from "./variant.service";
import { PriceTierService } from "./price-tier.service";
import { ItemModifierGroupService } from "./item-modifier-group.service";
import { ModifierGroupController } from "./modifier-group.controller";
import { ModifierGroupService } from "./modifier-group.service";
import { ModifierService } from "./modifier.service";

@Module({
  controllers: [CategoryController, UnitController, ItemController, ModifierGroupController],
  providers: [
    CategoryService,
    UnitService,
    ItemService,
    VariantService,
    PriceTierService,
    ItemModifierGroupService,
    ModifierGroupService,
    ModifierService,
  ],
})
export class CatalogModule {}
