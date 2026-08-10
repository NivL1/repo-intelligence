import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

interface RefreshTokenPayload {
  sub: string;
  email: string;
}

export interface RequestWithRefreshToken {
  userId: string;
  email: string;
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret') as string,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshTokenPayload): RequestWithRefreshToken {
    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req) as string;
    return { userId: payload.sub, email: payload.email, refreshToken };
  }
}
