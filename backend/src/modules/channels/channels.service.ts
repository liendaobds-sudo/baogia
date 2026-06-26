import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../entities';

@Injectable()
export class ChannelsService {
    constructor(
        @InjectRepository(Channel)
        private channelsRepo: Repository<Channel>,
    ) { }

    async findAll() {
        return { data: await this.channelsRepo.find({ order: { createdAt: 'DESC' } }) };
    }

    async findOne(id: string) {
        const channel = await this.channelsRepo.findOne({ where: { id } });
        if (!channel) throw new NotFoundException('Channel không tồn tại');
        return channel;
    }

    async create(data: Partial<Channel>) {
        const channel = this.channelsRepo.create(data);
        return this.channelsRepo.save(channel);
    }

    async update(id: string, data: Partial<Channel>) {
        const channel = await this.findOne(id);
        Object.assign(channel, data);
        return this.channelsRepo.save(channel);
    }
}
