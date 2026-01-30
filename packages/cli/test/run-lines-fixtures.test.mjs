import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function commandExists(cmd) {
  try {
    execFileSync("command", ["-v", cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("Spring Awakening scene PDFs exclude SCENE markers", async (t) => {
  if (!commandExists("pdftotext")) {
    t.skip("pdftotext not available");
    return;
  }

  const fxDir = path.join(__dirname, "fixtures");
  const scene4 = path.join(fxDir, "spring_awakening_scene4.pdf");
  const scene5 = path.join(fxDir, "spring_awakening_scene5.pdf");
  assert.ok(fs.existsSync(scene4), `Missing fixture: ${scene4}`);
  assert.ok(fs.existsSync(scene5), `Missing fixture: ${scene5}`);

  const text4 = execFileSync("pdftotext", [scene4, "-"], { encoding: "utf8" });
  const text5 = execFileSync("pdftotext", [scene5, "-"], { encoding: "utf8" });

  assert.ok(!text4.includes("SCENE 4"));
  assert.ok(!text4.includes("SCENE 5"));
  assert.ok(!text5.includes("SCENE 5"));
  assert.ok(!text5.includes("SCENE 6"));

  // Sanity: expected first-scene descriptions should appear.
  assert.match(text4, /Evening,\s*Melchior[’']?s study/i);
  assert.match(text5, /Afternoon\./i);
});

