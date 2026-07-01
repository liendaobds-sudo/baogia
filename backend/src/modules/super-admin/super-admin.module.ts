import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Tenant } from '../../entities/tenant.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { Payment } from '../../entities/payment.entity';
import { User } from '../../entities/user.entity';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';
import { CapabilityModule } from '../../quote/capability.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Tenant, SubscriptionPlan, Payment, User]),
        JwtModule.register({}),
        CapabilityModule,
    ],
    controllers: [SuperAdminController],
    providers: [SuperAdminService],
    exports: [SuperAdminService],
})
export class SuperAdminModule {}
