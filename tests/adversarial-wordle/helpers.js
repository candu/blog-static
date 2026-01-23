import fs from "node:fs/promises";
import { parseWordList } from "../../public/embeds/adversarial-wordle/lib.js";

export async function getWordListFromFile(path) {
  const text = await fs.readFile(path, "utf-8");
  return parseWordList(text);
}
