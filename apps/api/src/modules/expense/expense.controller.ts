import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { ExpenseCategoryService } from "./expense-category.service";
import { ExpenseService } from "./expense.service";
import { CreateExpenseCategoryDto } from "./dto/create-expense-category.dto";
import { UpdateExpenseCategoryDto } from "./dto/update-expense-category.dto";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { ExpenseQueryDto } from "./dto/expense-query.dto";

// PENTING: rute statis "/expenses/categories" WAJIB dideklarasikan sebelum
// rute dinamis "/expenses/:id" di controller yang sama, kalau tidak
// "categories" akan tertangkap sebagai nilai :id (NestJS mencocokkan rute
// berdasar urutan deklarasi, bukan spesifisitas).
@UseGuards(JwtAuthGuard)
@Controller("expenses")
export class ExpenseController {
  constructor(
    private readonly categoryService: ExpenseCategoryService,
    private readonly expenseService: ExpenseService,
  ) {}

  @Get("categories")
  listCategories(@CurrentUser() user: JwtPayload) {
    return this.categoryService.list(user.business_id);
  }

  @Get("categories/:id")
  getCategory(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.categoryService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post("categories")
  createCategory(@CurrentUser() user: JwtPayload, @Body() dto: CreateExpenseCategoryDto) {
    return this.categoryService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch("categories/:id")
  updateCategory(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.categoryService.update(user.business_id, id, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ExpenseQueryDto) {
    return this.expenseService.list(user.business_id, query);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.expenseService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateExpenseDto) {
    return this.expenseService.create(user.business_id, user.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenseService.update(user.business_id, id, dto);
  }
}
