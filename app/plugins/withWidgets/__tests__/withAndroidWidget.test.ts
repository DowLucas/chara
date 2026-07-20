import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Plain-JS plugin modules (Expo's plugin resolver requires directly-requirable JS).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { kotlinRImportTransform } = require('../withAndroidWidget');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { copyDirMerge } = require('../copy');

const KOTLIN_WITH_R = `package app.chara.widget

import android.widget.RemoteViews

class CharaWidgetProvider {
  val layout = R.layout.chara_widget_small
}
`;

const KOTLIN_WITHOUT_R = `package app.chara.widget

import org.json.JSONObject

object SnapshotStore
`;

describe('kotlinRImportTransform', () => {
  const transform = kotlinRImportTransform('chara.app.dev');

  it('injects the resolved R import after the package declaration', () => {
    const out = transform('CharaWidgetProvider.kt', KOTLIN_WITH_R);
    const lines = out.split('\n');
    expect(lines[0]).toBe('package app.chara.widget');
    expect(out).toContain('import chara.app.dev.R');
    // Import must precede first use.
    expect(out.indexOf('import chara.app.dev.R')).toBeLessThan(out.indexOf('R.layout'));
  });

  it('is idempotent — applying twice injects exactly one import', () => {
    const once = transform('CharaWidgetProvider.kt', KOTLIN_WITH_R);
    const twice = transform('CharaWidgetProvider.kt', once);
    expect(twice).toBe(once);
  });

  it('leaves files without R references untouched', () => {
    expect(transform('SnapshotStore.kt', KOTLIN_WITHOUT_R)).toBe(KOTLIN_WITHOUT_R);
  });

  it('resolves the production package too', () => {
    const out = kotlinRImportTransform('chara.app')('CharaWidgetProvider.kt', KOTLIN_WITH_R);
    expect(out).toContain('import chara.app.R');
    expect(out).not.toContain('import chara.app.dev.R');
  });

  it('injects into the real widget provider source', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../widgets/android/java/app/chara/widget/CharaWidgetProvider.kt'),
      'utf8',
    );
    const out = transform('CharaWidgetProvider.kt', src);
    expect(out).toContain('import chara.app.dev.R');
  });
});

describe('copyDirMerge with a transform', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'withwidgets-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('applies the transform to copied files and stays idempotent across re-runs', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    fs.mkdirSync(path.join(src, 'app/chara/widget'), { recursive: true });
    fs.writeFileSync(path.join(src, 'app/chara/widget/CharaWidgetProvider.kt'), KOTLIN_WITH_R);

    const transform = kotlinRImportTransform('chara.app');
    copyDirMerge(src, dest, transform);
    // Second prebuild without --clean copies onto the already-transformed tree.
    copyDirMerge(src, dest, transform);

    const out = fs.readFileSync(path.join(dest, 'app/chara/widget/CharaWidgetProvider.kt'), 'utf8');
    const importCount = out.split('import chara.app.R').length - 1;
    expect(importCount).toBe(1);
  });

  it('copies binary files byte-for-byte when the transform skips them', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    fs.mkdirSync(path.join(src, 'font'), { recursive: true });
    const bytes = Buffer.from([0x00, 0xff, 0x80, 0x01, 0xfe]);
    fs.writeFileSync(path.join(src, 'font/x.ttf'), bytes);

    copyDirMerge(src, dest, kotlinRImportTransform('chara.app'));

    expect(fs.readFileSync(path.join(dest, 'font/x.ttf'))).toEqual(bytes);
  });
});
