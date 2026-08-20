import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { DemoWriteGuard } from './guards/demo-write-guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { RequestWithRefreshToken } from './strategies/jwt-refresh.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(DemoWriteGuard)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<TokenResponseDto> {
    return this.auth.register(dto.email, dto.password);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@CurrentUser() user: RequestWithRefreshToken): Promise<TokenResponseDto> {
    return this.auth.refresh(user.userId, user.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: RequestUser): Promise<void> {
    await this.auth.logout(user.userId);
  }
}
