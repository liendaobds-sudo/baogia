import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsString, ValidateIf } from 'class-validator';

export class LoginDto {
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsNotEmpty()
    @MinLength(6)
    password: string;
}

export class RefreshTokenDto {
    @IsNotEmpty()
    refreshToken: string;
}
