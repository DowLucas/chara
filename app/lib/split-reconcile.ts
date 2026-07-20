// How a split's assigned total reconciles against the amount paid.
//
// `offByMinor = totalSplitMinor − amountPaidMinor`:
//   < 0  the split falls short — money is still unassigned ("left to assign")
//   > 0  the split exceeds what was paid ("over by")
//   = 0  they match
//
// Pure so the direction can be unit-tested — this decision shipped inverted
// once, reading an under-assigned split as "over by".

export type SplitBalance = 'matched' | 'over' | 'under';

export function splitBalance(offByMinor: number): SplitBalance {
  if (offByMinor === 0) return 'matched';
  return offByMinor > 0 ? 'over' : 'under';
}
