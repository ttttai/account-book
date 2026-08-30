import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

async function exists(path) {
  try {
    await stat(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

// PNGのIHDRチャンクから幅・高さを読み取る（署名検証を含む）
async function readPngSize(path) {
  const buffer = await readFile(new URL(path, root));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(
    buffer.subarray(0, 8),
    signature,
    `${path}がPNG形式ではありません`,
  );
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("NFR-PWA-001/002: manifestが名称・start_url・standalone・トークン一致色を宣言する", async () => {
  const manifest = await read("src/app/manifest.ts");

  assert.match(manifest, /name:\s*"わが家計"/);
  assert.match(manifest, /start_url:\s*"\/"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /theme_color:\s*"#f7f5ef"/);
  assert.match(manifest, /background_color:\s*"#f7f5ef"/);

  const styles = await read("src/app/styles.css");
  assert.match(
    styles,
    /--background:\s*#f7f5ef/,
    "manifestの色がデザイントークン--backgroundと一致しません",
  );

  const layout = await read("src/app/layout.tsx");
  assert.match(
    layout,
    /themeColor:\s*"#f7f5ef"/,
    "viewport.themeColorがmanifestのtheme_colorと一致しません",
  );
});

test("NFR-PWA-003: manifestが192・512・maskableのPNGアイコンを宣言する", async () => {
  const manifest = await read("src/app/manifest.ts");

  assert.match(manifest, /src:\s*"\/icon-192\.png"/);
  assert.match(manifest, /src:\s*"\/icon-512\.png"/);
  assert.match(manifest, /src:\s*"\/icon-maskable-512\.png"/);
  assert.match(manifest, /purpose:\s*"maskable"/);
});

test("NFR-PWA-003: 宣言済みアイコンとapple-touch-iconが宣言どおりの寸法で存在する", async () => {
  assert.deepEqual(await readPngSize("public/icon-192.png"), {
    width: 192,
    height: 192,
  });
  assert.deepEqual(await readPngSize("public/icon-512.png"), {
    width: 512,
    height: 512,
  });
  assert.deepEqual(await readPngSize("public/icon-maskable-512.png"), {
    width: 512,
    height: 512,
  });
  assert.deepEqual(await readPngSize("src/app/apple-icon.png"), {
    width: 180,
    height: 180,
  });
});

test("NFR-PWA-004: Service Workerとオフラインキャッシュを導入しない", async () => {
  assert.equal(await exists("public/sw.js"), false);
  assert.equal(await exists("public/service-worker.js"), false);

  const packageJson = JSON.parse(await read("package.json"));
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  });
  for (const name of dependencyNames) {
    assert.doesNotMatch(
      name,
      /next-pwa|workbox|serwist/,
      "Service Worker系の依存はMVPでは導入しません",
    );
  }
});
