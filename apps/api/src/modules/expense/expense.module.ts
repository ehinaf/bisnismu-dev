import { Module } from "@nestjs/common";
import { ExpenseController } from "./expense.controller";
import { ExpenseCategoryService } from "./expense-category.service";
import { ExpenseService } from "./expense.service";

@Module({
  controllers: [ExpenseController],
  providers: [ExpenseCategoryService, ExpenseService],
})
export class ExpenseModule {}
