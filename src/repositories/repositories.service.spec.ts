import { ConflictException, NotFoundException } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';

describe('RepositoriesService', () => {
  let repositories: {
    existsBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let workspace: { checkout: jest.Mock; headCommit: jest.Mock; remove: jest.Mock };
  let service: RepositoriesService;

  beforeEach(() => {
    repositories = {
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((row) => row),
      save: jest.fn((row) => Promise.resolve({ ...row, id: 'repo-id' })),
      find: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue({ id: 'repo-id', name: 'owner/repo' }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    workspace = {
      checkout: jest.fn().mockResolvedValue('/workspace/repo-id'),
      headCommit: jest.fn().mockResolvedValue('abc123'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new RepositoriesService(repositories as any, workspace as any);
  });

  it('derives owner/repo from a git URL, dropping the .git suffix', async () => {
    await service.create('https://github.com/NivL1/nestjs-ai-starter.git');

    expect(repositories.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NivL1/nestjs-ai-starter' }),
    );
  });

  it('derives only the leaf directory from a local path', async () => {
    await service.create('/Users/niv/Personal/nestjs-ai-starter');

    expect(repositories.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'nestjs-ai-starter' }),
    );
  });

  it('prefers an explicit name over the derived one', async () => {
    await service.create('https://github.com/NivL1/x.git', 'my-name');

    expect(repositories.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-name' }));
  });

  it('rejects a duplicate name before cloning anything', async () => {
    repositories.existsBy.mockResolvedValue(true);

    await expect(service.create('https://github.com/NivL1/x.git')).rejects.toThrow(
      ConflictException,
    );
    expect(workspace.checkout).not.toHaveBeenCalled();
  });

  it('records the head commit and moves to pending once checked out', async () => {
    await service.create('https://github.com/NivL1/x.git');

    expect(repositories.update).toHaveBeenCalledWith('repo-id', {
      status: 'pending',
      indexedCommit: 'abc123',
    });
  });

  it('marks the repository failed with the reason when checkout throws', async () => {
    workspace.checkout.mockRejectedValue(new Error('repository not found'));

    await expect(service.create('https://github.com/NivL1/x.git')).rejects.toThrow(
      'repository not found',
    );
    expect(repositories.update).toHaveBeenCalledWith('repo-id', {
      status: 'failed',
      error: 'repository not found',
    });
  });

  it('throws NotFound for an unknown id', async () => {
    repositories.findOneBy.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('removes the working copy along with the row', async () => {
    await service.remove('repo-id');

    expect(repositories.delete).toHaveBeenCalledWith('repo-id');
    expect(workspace.remove).toHaveBeenCalledWith('repo-id');
  });
});
