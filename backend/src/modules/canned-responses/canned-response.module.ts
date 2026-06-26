import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CannedResponse } from '../../entities/canned-response.entity';
import { CannedResponseService } from './canned-response.service';
import { CannedResponseController } from './canned-response.controller';

@Module({
    imports: [TypeOrmModule.forFeature([CannedResponse])],
    controllers: [CannedResponseController],
    providers: [CannedResponseService],
    exports: [CannedResponseService],
})
export class CannedResponseModule { }
