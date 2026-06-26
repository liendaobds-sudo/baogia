import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../../entities/role.entity';
import { RolePermission } from '../../entities/role-permission.entity';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([Role, RolePermission]),
    ],
    controllers: [RbacController],
    providers: [RbacService],
    exports: [RbacService],
})
export class RbacModule {}
