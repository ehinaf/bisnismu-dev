import { ArrayUnique, IsArray, IsIn } from "class-validator";
import { ALL_PERMISSIONS, type PermissionKey } from "../../../common/permissions/permissions";

export class UpdateUserPermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions!: PermissionKey[];
}
