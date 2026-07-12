import { Module } from "@nestjs/common";
import { CashdrawerController } from "./cashdrawer.controller";
import { CashdrawerService } from "./cashdrawer.service";

@Module({
  controllers: [CashdrawerController],
  providers: [CashdrawerService],
  exports: [CashdrawerService],
})
export class CashdrawerModule {}
