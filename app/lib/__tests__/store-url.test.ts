import { storeReviewUrl } from '../store-url';

describe('storeReviewUrl', () => {
  it('returns App Store URL on iOS', () => {
    const url = storeReviewUrl({ platform: 'ios', appStoreId: '1234567890', androidPackage: 'app.chara' });
    expect(url).toBe('itms-apps://itunes.apple.com/app/id1234567890?action=write-review');
  });

  it('returns Play Store URL on Android', () => {
    const url = storeReviewUrl({ platform: 'android', appStoreId: '1234567890', androidPackage: 'app.chara' });
    expect(url).toBe('market://details?id=app.chara');
  });

  it('returns web App Store URL on web', () => {
    const url = storeReviewUrl({ platform: 'web', appStoreId: '1234567890', androidPackage: 'app.chara' });
    expect(url).toBe('https://apps.apple.com/app/id1234567890');
  });

  it('returns null when iOS but appStoreId missing', () => {
    expect(storeReviewUrl({ platform: 'ios', appStoreId: null, androidPackage: 'app.chara' })).toBeNull();
  });

  it('returns null when Android but package missing', () => {
    expect(storeReviewUrl({ platform: 'android', appStoreId: '123', androidPackage: null })).toBeNull();
  });
});
