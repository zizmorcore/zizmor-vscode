import { join, delimiter, sep, posix } from 'node:path';
import * as fs from 'node:fs/promises';

/** Options bag */
export interface Options {
    /** Use instead of the PATH environment variable. */
    path?: string | undefined;
    /** Use instead of the PATHEXT environment variable. */
    pathExt?: string | undefined;
    /** Use instead of the platform's native path separator. */
    delimiter?: string | undefined;
}

const isWindows = process.platform === 'win32';

/**
 * Used to check for slashed in commands passed in.
 * Always checks for the POSIX separator on all platforms,
 * and checks for the current separator when not on a POSIX platform.
 */
const rSlash = new RegExp(`[${posix.sep}${sep === posix.sep ? '' : sep}]`.replace(/(\\)/g, '\\$1'));
const rRel = new RegExp(`^\\.${rSlash.source}`);

const getPathInfo = (cmd: string, {
    path: optPath = process.env.PATH,
    pathExt: optPathExt = process.env.PATHEXT,
    delimiter: optDelimiter = delimiter,
}: Partial<Options>) => {
    // If it has a slash, then we don't bother searching the pathenv.
    // just check the file itself, and that's it.
    const pathEnv = cmd.match(rSlash) ? [''] : [
        // Windows always checks the cwd first.
        ...(isWindows ? [process.cwd()] : []),
        ...(optPath ?? '').split(optDelimiter),
    ];

    if (isWindows) {
        const pathExtExe = optPathExt ??
            ['.EXE', '.CMD', '.BAT', '.COM'].join(optDelimiter);
        const pathExt = pathExtExe.split(optDelimiter).flatMap((item) => [item, item.toLowerCase()]);
        if (cmd.includes('.') && pathExt[0] !== '') {
            pathExt.unshift('');
        }
        return { pathEnv, pathExt };
    }

    return { pathEnv, pathExt: [''] };
};

const getPathPart = (raw: string, cmd: string) => {
    const pathPart = /^".*"$/.test(raw) ? raw.slice(1, -1) : raw;
    const prefix = !pathPart && rRel.test(cmd) ? cmd.slice(0, 2) : '';
    return prefix + join(pathPart, cmd);
};

/**
 * Emulate POSIX `command -v` cross-playform.
 *
 * @param cmd - command to search the PATH for.
 * @param options - options to customize the lookup.
 * @returns The path to the desired executable, or `undefined` if not found.
 */
export const which = async (
    cmd: string,
    options: Options = {},
): Promise<string | undefined> => {
    const { pathEnv, pathExt } = getPathInfo(cmd, options);

    for (const envPart of pathEnv) {
        const p = getPathPart(envPart, cmd);

        for (const ext of pathExt) {
            const candidate = p + ext;

            try {
                await fs.access(candidate, fs.constants.F_OK);
                return candidate;
            } catch { }
        }
    }

    return undefined;
};
