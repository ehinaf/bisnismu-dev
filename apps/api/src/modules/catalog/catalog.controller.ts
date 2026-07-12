import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { CatalogService } from "./catalog.service";

@UseGuards(JwtAuthGuard)
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("items")
  listItems(@CurrentUser() user: JwtPayload) {
    return this.catalogService.listItems(user.business_id);
  }
}
