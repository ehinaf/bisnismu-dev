import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller";
import { CategoryService } from "./category.service";
import { UnitController } from "./unit.controller";
import { UnitService } from "./unit.service";
import { ItemController } from "./item.controller";
import { ItemService } from "./item.service";
import { VariantService } from "./variant.service";

@Module({
  controllers: [CategoryController, UnitController, ItemController],
  providers: [CategoryService, UnitService, ItemService, VariantService],
})
export class CatalogModule {}
