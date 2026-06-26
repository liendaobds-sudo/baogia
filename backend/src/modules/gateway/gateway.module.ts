import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { EventsGateway } from './events.gateway';

@Global()
@Module({
    imports: [
        JwtModule.register({}),
        ConfigModule,
    ],
    providers: [EventsGateway],
    exports: [EventsGateway],
})
export class GatewayModule { }
