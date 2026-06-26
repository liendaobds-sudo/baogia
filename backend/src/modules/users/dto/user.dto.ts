import { IsEmail, IsNotEmpty, IsEnum, IsOptional, MinLength } from 'class-validator';
import { UserRole } from '../../../entities';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @IsNotEmpty()
    fullName: string;

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;
}

export class UpdateUserDto {
    @IsOptional()
    fullName?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    isActive?: boolean;
}
