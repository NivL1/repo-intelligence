import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let users: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    setRefreshTokenHash: jest.Mock;
  };
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };
  let service: AuthService;

  const jwtConfig: Record<string, string> = {
    'jwt.accessSecret': 'access-secret',
    'jwt.accessTtl': '900s',
    'jwt.refreshSecret': 'refresh-secret',
    'jwt.refreshTtl': '7d',
  };

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    config = { get: jest.fn((key: string) => jwtConfig[key]) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(users as any, jwt as any, config as any);
  });

  describe('constructor', () => {
    it('throws if a required JWT config key is missing', () => {
      const incompleteConfig = { get: jest.fn().mockReturnValue(undefined) };
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => new AuthService(users as any, jwt as any, incompleteConfig as any),
      ).toThrow('Missing required config: jwt.accessSecret');
    });
  });

  describe('register', () => {
    it('throws ConflictException when the email is already registered', async () => {
      users.findByEmail.mockResolvedValue({ id: '1', email: 'a@b.com' });

      await expect(service.register('a@b.com', 'password123')).rejects.toThrow(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('hashes the password, creates the user, and returns tokens', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

      const result = await service.register('a@b.com', 'password123');

      expect(users.create).toHaveBeenCalledWith('a@b.com', expect.any(String));
      const [, passwordHash] = users.create.mock.calls[0];
      expect(passwordHash).not.toBe('password123');
      await expect(bcrypt.compare('password123', passwordHash)).resolves.toBe(true);

      expect(users.setRefreshTokenHash).toHaveBeenCalledWith('user-1', expect.any(String));
      expect(result).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the email is not found', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(service.login('nobody@b.com', 'x')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      users.findByEmail.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash });

      await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns tokens on a matching password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      users.findByEmail.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash });

      const result = await service.login('a@b.com', 'correct-password');

      expect(result).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
      expect(users.setRefreshTokenHash).toHaveBeenCalledWith('user-1', expect.any(String));
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the user has no stored refresh token hash', async () => {
      users.findById.mockResolvedValue({ id: 'user-1', email: 'a@b.com', refreshTokenHash: null });

      await expect(service.refresh('user-1', 'some-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the presented token does not match the stored hash', async () => {
      const refreshTokenHash = await bcrypt.hash('the-real-refresh-token', 4);
      users.findById.mockResolvedValue({ id: 'user-1', email: 'a@b.com', refreshTokenHash });

      await expect(service.refresh('user-1', 'a-different-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates and returns a new token pair when the presented token matches', async () => {
      const refreshTokenHash = await bcrypt.hash('the-real-refresh-token', 4);
      users.findById.mockResolvedValue({ id: 'user-1', email: 'a@b.com', refreshTokenHash });

      const result = await service.refresh('user-1', 'the-real-refresh-token');

      expect(result).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
      expect(users.setRefreshTokenHash).toHaveBeenCalledWith('user-1', expect.any(String));
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await service.logout('user-1');

      expect(users.setRefreshTokenHash).toHaveBeenCalledWith('user-1', null);
    });
  });
});
