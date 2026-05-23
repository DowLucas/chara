/**
 * Tests for the imperative AppAlert API.
 *
 * AppAlert is a pure module — no React imports — that exposes a Promise-based
 * `showAlert()` and a subscriber surface that the host component drives.
 */

import {
  showAlert,
  subscribeToAlerts,
  __resetAppAlertForTests,
  type AppAlertRequest,
} from '../app-alert';

describe('app-alert', () => {
  beforeEach(() => {
    __resetAppAlertForTests();
  });

  it('showAlert returns a Promise', () => {
    const p = showAlert({ title: 'Hello' });
    expect(typeof (p as Promise<unknown>).then).toBe('function');
  });

  it('subscriber receives the alert and can resolve it', async () => {
    const received: AppAlertRequest[] = [];
    subscribeToAlerts((next) => {
      if (next) received.push(next);
    });

    const promise = showAlert({
      title: 'Confirm',
      message: 'Are you sure?',
      buttons: [
        { key: 'cancel', label: 'Cancel', style: 'cancel' },
        { key: 'ok', label: 'OK', style: 'default' },
      ],
    });

    expect(received).toHaveLength(1);
    expect(received[0].title).toBe('Confirm');
    expect(received[0].buttons).toHaveLength(2);

    received[0].resolve('ok');
    await expect(promise).resolves.toBe('ok');
  });

  it('sequential showAlert calls queue and resolve in order (FIFO)', async () => {
    const received: AppAlertRequest[] = [];
    subscribeToAlerts((next) => {
      if (next) received.push(next);
    });

    const p1 = showAlert({ title: 'First' });
    const p2 = showAlert({ title: 'Second' });

    // Only the first alert is delivered to the subscriber.
    expect(received).toHaveLength(1);
    expect(received[0].title).toBe('First');

    received[0].resolve('ok');
    await expect(p1).resolves.toBe('ok');

    // After the first resolves, the second is delivered.
    expect(received).toHaveLength(2);
    expect(received[1].title).toBe('Second');

    received[1].resolve('ok');
    await expect(p2).resolves.toBe('ok');
  });

  it('dismissable alert resolves to null when dismissed', async () => {
    const received: AppAlertRequest[] = [];
    subscribeToAlerts((next) => {
      if (next) received.push(next);
    });

    const promise = showAlert({
      title: 'Dismissable',
      dismissable: true,
    });

    expect(received[0].dismissable).toBe(true);
    received[0].dismiss();
    await expect(promise).resolves.toBeNull();
  });

  it('non-dismissable alert ignores dismiss() and only resolves on a button', async () => {
    const received: AppAlertRequest[] = [];
    subscribeToAlerts((next) => {
      if (next) received.push(next);
    });

    const promise = showAlert({
      title: 'Required',
      dismissable: false,
      buttons: [{ key: 'ok', label: 'OK' }],
    });

    expect(received[0].dismissable).toBe(false);

    // dismiss() is a no-op when non-dismissable.
    received[0].dismiss();
    // Promise must still be pending; resolve via button.
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    received[0].resolve('ok');
    await expect(promise).resolves.toBe('ok');
  });

  it('defaults to a single OK button when none provided', () => {
    const received: AppAlertRequest[] = [];
    subscribeToAlerts((next) => {
      if (next) received.push(next);
    });

    void showAlert({ title: 'Hi' });
    expect(received[0].buttons).toHaveLength(1);
    expect(received[0].buttons[0].key).toBe('ok');
  });
});
