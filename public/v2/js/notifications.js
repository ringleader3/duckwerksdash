const POLL_INTERVAL_MS   = 5 * 60 * 1000;
const NOTIFICATION_TITLE = 'New Orders';
const NOTIFICATION_BODY  = 'You have {count} orders awaiting shipment';
const NOTIFICATION_TAG   = 'dw-orders';
const NOTIFICATION_ICON  = '';

const DwNotifications = {
  lastOrderCount: null,

  async requestPermission() {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  },

  notify(title, body, tag) {
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, tag, icon: NOTIFICATION_ICON });
  },

  checkAndNotify(count) {
    if (this.lastOrderCount === null) {
      this.lastOrderCount = count;
      if (count > 0) {
        const body = NOTIFICATION_BODY.replace('{count}', count);
        this.notify(NOTIFICATION_TITLE, body, NOTIFICATION_TAG);
      }
      return;
    }
    if (count > this.lastOrderCount) {
      const body = NOTIFICATION_BODY.replace('{count}', count);
      this.notify(NOTIFICATION_TITLE, body, NOTIFICATION_TAG);
    }
    this.lastOrderCount = count;
  },

  get pollIntervalMs() { return POLL_INTERVAL_MS; },
  get testTitle()      { return NOTIFICATION_TITLE; },
  get testBody()       { return NOTIFICATION_BODY.replace('{count}', 3); },
  get testTag()        { return NOTIFICATION_TAG; },
};
