import fs from 'node:fs';
import path from 'node:path';
import { nextFire, Rule, Status } from '../recurring/next-fire';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../backend/internal/recurring/testdata/recurring-fixtures.json',
);

interface FixtureCase {
  name: string;
  rule: Rule;
  occurrence: string;
  expected_next_fire: string;
  expected_status: Status;
}

const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
  version: number;
  cases: FixtureCase[];
};

describe('nextFire — shared Go+Jest contract', () => {
  expect(fixtures.version).toBe(1);

  for (const c of fixtures.cases) {
    test(c.name, () => {
      const occ = new Date(c.occurrence);
      const expected = new Date(c.expected_next_fire);
      const got = nextFire(c.rule, occ);
      expect(got.next_fire.toISOString()).toBe(expected.toISOString());
      expect(got.status).toBe(c.expected_status);
    });
  }
});
