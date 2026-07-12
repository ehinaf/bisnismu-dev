import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller";
import { CategoryService } from "./category.service";
import { UnitController } from "./unit.controller";
import { UnitService } from "./unit.service";
import { ItemController } from "./item.controller";
import { ItemService } from "./item.service";
import { VariantService } from "./variant.service";
import { PriceTierService } from "./price-tier.service";

@Module({
  controllers: [CategoryController, UnitController, ItemController],
  providers: [CategoryService, UnitService, ItemService, VariantService, PriceTierService],
})
export class CatalogModule {}
