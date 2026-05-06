import { test, expect } from '@playwright/test';

// Phase 4 — Demo Pillar #3: library → semantic block abstraction.
//
// Naive introspection produces 1:1 (every method → block), exploding the
// toolbox. Our claim is that you only need a small bounded set of semantic
// blocks per library. This spec drives the deterministic clustering path
// from Playwright with synthetic introspection data so the test is fully
// reproducible (no backend, no LLM, no network).

const ready = async (page, url = '/?test=1') => {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');
  await page.waitForFunction(() => typeof window.__cluster === 'function');
  await page.evaluate(() => {
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  // Reload so libraryManager picks up the cleaned localStorage
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');
  await page.waitForFunction(() => typeof window.__cluster === 'function');
  await page.evaluate(() => window.__resetWorkspace());
};

// Synthetic introspection mimicking what `cv2` would return — many color
// conversion variants, a few capture/imread methods, and noise like dunders.
const FAKE_CV2 = [
  // Dunder noise — should be dropped
  { name: '__version__', kind: 'attr', params: [] },
  { name: '__name__',    kind: 'attr', params: [] },
  { name: '_internal_helper', kind: 'function', params: [] },

  // Color conversion variants — should cluster
  { name: 'cvtColor',           kind: 'function', params: [{ name: 'src' }, { name: 'code' }] },
  { name: 'cvtColorBGR2RGB',    kind: 'function', params: [{ name: 'src' }] },
  { name: 'cvtColorRGB2BGR',    kind: 'function', params: [{ name: 'src' }] },
  { name: 'cvtColorGray2BGR',   kind: 'function', params: [{ name: 'src' }] },
  { name: 'cvtColorBGR2HSV',    kind: 'function', params: [{ name: 'src' }] },

  // Image IO — should cluster
  { name: 'imread',  kind: 'function', params: [{ name: 'filename' }, { name: 'flags', annotation: 'int' }] },
  { name: 'imwrite', kind: 'function', params: [{ name: 'filename' }, { name: 'img' }] },
  { name: 'imshow',  kind: 'function', params: [{ name: 'winname' }, { name: 'mat' }] },
  { name: 'imdecode', kind: 'function', params: [{ name: 'buf' }, { name: 'flags', annotation: 'int' }] },
  { name: 'imencode', kind: 'function', params: [{ name: 'ext' }, { name: 'img' }] },

  // Video — should cluster
  { name: 'VideoCapture',  kind: 'class', params: [{ name: 'index', annotation: 'int' }] },
  { name: 'VideoWriter',   kind: 'class', params: [{ name: 'filename' }, { name: 'fourcc' }] },
  { name: 'VideoWriter_fourcc', kind: 'function', params: [] },

  // GUI / waiting — should cluster
  { name: 'waitKey',       kind: 'function', params: [{ name: 'delay', annotation: 'int' }] },
  { name: 'waitKeyEx',     kind: 'function', params: [{ name: 'delay', annotation: 'int' }] },
  { name: 'destroyAllWindows', kind: 'function', params: [] },
  { name: 'destroyWindow', kind: 'function', params: [{ name: 'winname' }] },

  // Drawing — should cluster
  { name: 'rectangle', kind: 'function', params: [{ name: 'img' }, { name: 'pt1' }, { name: 'pt2' }, { name: 'color' }] },
  { name: 'circle',    kind: 'function', params: [{ name: 'img' }, { name: 'center' }, { name: 'radius', annotation: 'int' }, { name: 'color' }] },
  { name: 'line',      kind: 'function', params: [{ name: 'img' }, { name: 'pt1' }, { name: 'pt2' }, { name: 'color' }] },
  { name: 'ellipse',   kind: 'function', params: [{ name: 'img' }, { name: 'box' }, { name: 'color' }] },
  { name: 'polylines', kind: 'function', params: [{ name: 'img' }, { name: 'pts' }, { name: 'isClosed', annotation: 'bool' }, { name: 'color' }] },
  { name: 'putText',   kind: 'function', params: [{ name: 'img' }, { name: 'text' }, { name: 'org' }] },

  // Filtering — should cluster
  { name: 'GaussianBlur', kind: 'function', params: [{ name: 'src' }, { name: 'ksize' }, { name: 'sigmaX', annotation: 'float' }] },
  { name: 'medianBlur',   kind: 'function', params: [{ name: 'src' }, { name: 'ksize', annotation: 'int' }] },
  { name: 'bilateralFilter', kind: 'function', params: [{ name: 'src' }, { name: 'd', annotation: 'int' }] },
  { name: 'blur',           kind: 'function', params: [{ name: 'src' }, { name: 'ksize' }] },

  // Threshold — should cluster
  { name: 'threshold',         kind: 'function', params: [{ name: 'src' }, { name: 'thresh', annotation: 'float' }] },
  { name: 'adaptiveThreshold', kind: 'function', params: [{ name: 'src' }, { name: 'maxValue' }] },

  // Misc one-off
  { name: 'getBuildInformation', kind: 'function', params: [] },
];

test.describe('Phase 4 — Library → Semantic block abstraction (Scenario C)', () => {
  test('C1: clustering caps the toolbox to the configured maxBlocks', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate((intro) => window.__cluster(intro, { maxBlocks: 8 }), FAKE_CV2);

    expect(result.blocks.length).toBeLessThanOrEqual(8);
    expect(result.blocks.length).toBeGreaterThan(0);
    // Dunder + private should be dropped
    expect(result.dropped).toEqual(expect.arrayContaining(['__version__', '__name__', '_internal_helper']));
  });

  test('C2: compression ratio — 30+ raw callables → ≤ 8 semantic blocks', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate((intro) => window.__cluster(intro, { maxBlocks: 8 }), FAKE_CV2);

    // Raw input had 32 callables; semantic output should be much smaller.
    expect(FAKE_CV2.length).toBeGreaterThanOrEqual(30);
    expect(result.blocks.length).toBeLessThanOrEqual(FAKE_CV2.length / 3);
  });

  test('C3: variants for grouped callables exposed as a dropdown', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate((intro) => window.__cluster(intro, { maxBlocks: 8 }), FAKE_CV2);

    // The cvtColor* family should land in a single group with a VARIANT dropdown.
    const cvtBlock = result.blocks.find(b => b._members.some(m => m.startsWith('cvtColor')));
    expect(cvtBlock, 'cvtColor* should cluster into a single block').toBeTruthy();
    expect(cvtBlock._members.length).toBeGreaterThan(1);
    const dropdownField = cvtBlock.inputs[0].fields.find(f => f.name === 'VARIANT');
    expect(dropdownField, 'multi-member block should have a VARIANT dropdown').toBeTruthy();
    const optionValues = dropdownField.options.map(([, v]) => v);
    expect(optionValues).toContain('cvtColor');
    expect(optionValues).toContain('cvtColorBGR2RGB');
  });

  test('C4: semantic install adds a single category to the toolbox', async ({ page }) => {
    await ready(page);
    const out = await page.evaluate(
      (intro) => window.__installSemantic('cv2', intro, { maxBlocks: 8 }),
      FAKE_CV2,
    );
    expect(out.ok).toBe(true);
    expect(out.stats.semanticCount).toBeLessThanOrEqual(8);
    expect(out.stats.rawCount).toBe(FAKE_CV2.length);
    expect(out.stats.compressionRatio).toBeLessThanOrEqual(0.34);

    const installed = await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name));
    expect(installed).toContain('cv2-semantic');
  });

  test('C5: roundtrip — building with a semantic block survives blocks ↔ python', async ({ page }) => {
    await ready(page);

    // Install the semantic library
    const installResult = await page.evaluate(
      (intro) => window.__installSemantic('cv2', intro, { maxBlocks: 8 }),
      FAKE_CV2,
    );
    expect(installResult.ok).toBe(true);

    // Find the cvtColor cluster's block type
    const blockType = await page.evaluate((intro) => {
      const r = window.__cluster(intro, { maxBlocks: 8 });
      const cvt = r.blocks.find(b => b._members.some(m => m.startsWith('cvtColor')));
      return cvt && cvt.type;
    }, FAKE_CV2);
    expect(blockType).toMatch(/^sem_/);

    // Drop the semantic block on the workspace and capture python output
    await page.evaluate((bt) => {
      window.__loadBlockly({
        blocks: {
          languageVersion: 0,
          blocks: [{ type: bt, x: 40, y: 40, fields: { VARIANT: 'cvtColorBGR2RGB' } }],
        },
      });
    }, blockType);
    await page.waitForTimeout(200);

    // Vocabulary contract: the semantic block is in the toolbox via the
    // newly-installed library category — must NOT appear as a ghost.
    const ghosts = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      const types = ws.getAllBlocks(false).map(b => b.type);
      const tb = new Set(window.__getToolboxBlockTypes());
      return types.filter(t => !tb.has(t));
    });
    expect(ghosts, 'semantic block should be in toolbox after install').toEqual([]);

    await page.evaluate(() => window.__setMode('python'));
    await page.waitForFunction(() => window.__getMode() === 'python');
    await page.waitForTimeout(150);
    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/cv2\.cvtColorBGR2RGB/);

    // Toggle back to blocks — semantic block should still be there
    await page.evaluate(() => window.__setMode('blocks'));
    await page.waitForFunction(() => window.__getMode() === 'blocks');
    await page.waitForTimeout(400);
    const types = await page.evaluate(
      () => window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type)
    );
    expect(types).toContain(blockType);
  });

  test('C6: empty / unknown introspection returns an empty cluster (graceful)', async ({ page }) => {
    await ready(page);
    const empty = await page.evaluate(() => window.__cluster([], { maxBlocks: 8 }));
    expect(empty.blocks).toEqual([]);

    const onlyDunders = await page.evaluate(() => window.__cluster(
      [{ name: '__init__' }, { name: '_x' }, { name: '__repr__' }], { maxBlocks: 8 }
    ));
    expect(onlyDunders.blocks).toEqual([]);
  });
});
