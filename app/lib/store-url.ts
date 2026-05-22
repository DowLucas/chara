export type StorePlatform = 'ios' | 'android' | 'web';

export interface StoreReviewUrlOpts {
  platform: StorePlatform;
  appStoreId: string | null;
  androidPackage: string | null;
}

export function storeReviewUrl({ platform, appStoreId, androidPackage }: StoreReviewUrlOpts): string | null {
  if (platform === 'ios') {
    if (!appStoreId) return null;
    return `itms-apps://itunes.apple.com/app/id${appStoreId}?action=write-review`;
  }
  if (platform === 'android') {
    if (!androidPackage) return null;
    return `market://details?id=${androidPackage}`;
  }
  if (!appStoreId) return null;
  return `https://apps.apple.com/app/id${appStoreId}`;
}
