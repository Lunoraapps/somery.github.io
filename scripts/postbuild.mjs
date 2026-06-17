import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const legacyReleaseSource = new URL("../dist/somery/releases/index.html", import.meta.url);
const legacyReleaseTarget = new URL("../dist/somery/releases.html", import.meta.url);

await mkdir(dirname(legacyReleaseTarget.pathname), { recursive: true });
await copyFile(legacyReleaseSource, legacyReleaseTarget);
