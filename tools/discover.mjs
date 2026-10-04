import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
export async function discover(root, predicate) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) results.push(...await discover(path, predicate));
    else if (entry.isFile() && predicate(path)) results.push(path);
  }
  return results;
}
