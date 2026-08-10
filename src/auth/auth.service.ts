import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { TokenResponseDto } from './dto/token-response.dto';

const SALT_ROUNDS = 12;

interface JwtSettings {
  accessSecret: string;
  accessTtl: string;
  refreshSecret: string;
  refreshTtl: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSettings: JwtSettings;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    // Read once at construction instead of on every token issuance: these
    // values are static for the process lifetime, and asserting them here
    // turns a misconfiguration into a clear boot-time error instead of an
    // opaque jwt.sign() failure the first time someone logs in.
    this.jwtSettings = {
      accessSecret: this.requireConfig(config, 'jwt.accessSecret'),
      accessTtl: this.requireConfig(config, 'jwt.accessTtl'),
      refreshSecret: this.requireConfig(config, 'jwt.refreshSecret'),
      refreshTtl: this.requireConfig(config, 'jwt.refreshTtl'),
    };
  }

  async register(email: string, password: string): Promise<TokenResponseDto> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.users.create(email, passwordHash);
    return this.issueTokenPair(user.id, user.email);
  }

  async login(email: string, password: string): Promise<TokenResponseDto> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user.id, user.email);
  }

  async refresh(userId: string, presentedRefreshToken: string): Promise<TokenResponseDto> {
    const user = await this.users.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const matches = await bcrypt.compare(presentedRefreshToken, user.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    // Rotate: every refresh invalidates the previous refresh token.
    return this.issueTokenPair(user.id, user.email);
  }

  async logout(userId: string): Promise<void> {
    await this.users.setRefreshTokenHash(userId, null);
  }

  private async issueTokenPair(userId: string, email: string): Promise<TokenResponseDto> {
    const payload = { sub: userId, email };

    const accessToken = this.jwt.sign(payload, {
      secret: this.jwtSettings.accessSecret,
      expiresIn: this.jwtSettings.accessTtl,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.jwtSettings.refreshSecret,
      expiresIn: this.jwtSettings.refreshTtl,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await this.users.setRefreshTokenHash(userId, refreshTokenHash);

    return { accessToken, refreshToken };
  }

  private requireConfig(config: ConfigService, key: string): string {
    const value = config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required config: ${key}`);
    }
    return value;
  }
}
