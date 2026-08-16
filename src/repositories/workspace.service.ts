import { execFile } from 'child_process';
import { mkdir, rm, stat } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import { promisify } from 'util';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const run = promisify(execFile);

/**
 * Owns the on-disk working copies that the indexer parses.
 *
 * Everything here shells out to `git`, with a user-supplied `source` as
 * input, so two rules hold throughout:
 *   1. Arguments go through execFile's array form — never a shell string —
 *      so no amount of quoting in `source` can inject a second command.
 *   2. Remote sources are restricted to https:// (see assertSafeSource).
 */
@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns the directory the given repository should be parsed from,
   * cloning it first if the source is remote. Local sources are analysed
   * in place rather than copied — nothing here writes to them.
   */
  async checkout(repositoryId: string, source: string): Promise<string> {
    this.assertSafeSource(source);

    if (isAbsolute(source)) {
      await this.assertReadable(source);
      return source;
    }

    const target = this.resolvePath(repositoryId, source);
    await mkdir(this.workspaceRoot(), { recursive: true });
    await rm(target, { recursive: true, force: true });

    this.logger.log(`Cloning ${source} into ${target}`);
    // --depth 1: history is irrelevant, we only ever parse the current tree.
    await run('git', ['clone', '--depth', '1', '--', source, target]);

    return target;
  }

  /**
   * Same path checkout() would use, computed with no filesystem or git
   * access. For read-only queries (e.g. checking whether a spec file
   * exists) that shouldn't pay for a re-clone just to answer a question —
   * they read whatever was left on disk by the last checkout(), which is
   * a stale-but-safe assumption: worst case is a missing/wrong answer for
   * a repo that moved since it was last indexed, not a wrong write.
   */
  resolvePath(repositoryId: string, source: string): string {
    // The UUID is the directory name, so no part of the path is derived
    // from user input and there is nothing to sanitise for traversal.
    return isAbsolute(source) ? source : join(this.workspaceRoot(), repositoryId);
  }

  /** Short-circuits re-indexing when the working copy hasn't moved. */
  async headCommit(checkoutPath: string): Promise<string | null> {
    try {
      const { stdout } = await run('git', ['-C', checkoutPath, 'rev-parse', 'HEAD']);
      return stdout.trim();
    } catch {
      // A local directory that isn't a git repo is still analysable; it
      // just can't be change-detected.
      return null;
    }
  }

  async remove(repositoryId: string): Promise<void> {
    await rm(join(this.workspaceRoot(), repositoryId), { recursive: true, force: true });
  }

  private workspaceRoot(): string {
    return resolve(this.config.get<string>('workspaceDir') ?? './.workspace');
  }

  /**
   * Remote sources are https:// only. This is not just tidiness: git
   * supports transport helpers such as `ext::sh -c <cmd>`, which execute
   * arbitrary commands on clone. Parsing with `new URL()` and demanding
   * https rejects those, along with file:// and ssh:// sources that would
   * otherwise reach the host's credentials.
   */
  private assertSafeSource(source: string): void {
    if (isAbsolute(source)) {
      return;
    }

    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new BadRequestException('source must be an https:// git URL or an absolute local path');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException(
        `unsupported source protocol "${url.protocol}" — only https:// is allowed`,
      );
    }
  }

  private async assertReadable(path: string): Promise<void> {
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(path);
    } catch {
      throw new BadRequestException(`local path is not readable: ${path}`);
    }
    // A file (not a directory) passes a plain access() check but fails
    // ts-morph in a much more confusing way later — catch it here instead.
    if (!stats.isDirectory()) {
      throw new BadRequestException(`local path is not a directory: ${path}`);
    }
  }
}
