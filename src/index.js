const { register, listen } = require('push-receiver');
const { ipcMain } = require('electron');
const Config = require('electron-config');

//  Event to be sent from renderer process to trigger service start
const START_NOTIFICATION_SERVICE = 'PUSH_RECEIVER:::START_NOTIFICATION_SERVICE';
//  Event sent to the renderer process once the service is up
const NOTIFICATION_SERVICE_STARTED = 'PUSH_RECEIVER:::NOTIFICATION_SERVICE_STARTED';
//  Event sent to the renderer process if an error has occured during the starting process
const NOTIFICATION_SERVICE_ERROR = 'PUSH_RECEIVER:::NOTIFICATION_SERVICE_ERROR';
//  Event sent to the renderer processs when a notification has been received
const NOTIFICATION_RECEIVED = 'PUSH_RECEIVER:::NOTIFICATION_RECEIVED';
//  Event sent to the renderer processs when the FCM token has been updated
const TOKEN_UPDATED = 'PUSH_RECEIVER:::TOKEN_UPDATED';

const config = new Config();

module.exports = {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
  setup,
};

// To be sure that start is called only once
let started = false;

// To be call from the main process
function setup(webContents) {
  // Will be called by the renderer process
  ipcMain.on(START_NOTIFICATION_SERVICE, async (_, senderId) => {
    // Retrieve saved credentials
    let credentials = config.get('credentials');
    // Retrieve saved senderId
    const savedSenderId = config.get('senderId');
    if (started) {
      webContents.send(NOTIFICATION_SERVICE_STARTED, (credentials.fcm || {}).token);
      return;
    }
    started = true;
    try {
      // Retrieve saved persistentId : avoid receiving all already received notifications on start
      const persistentIds = config.get('persistentIds') || [];
      // Register if no credentials or if senderId has changed
      if (!credentials || savedSenderId !== senderId) {
        credentials = await register(senderId);
        // Save credentials for later use
        config.set('credentials', credentials);
        // Save senderId
        config.set('senderId', senderId);
        // Notify the renderer process that the FCM token has changed
        webContents.send(TOKEN_UPDATED, credentials.fcm.token);
      }
      // Listen for GCM/FCM notifications
      await listen(Object.assign({}, credentials, { persistentIds }), onNotification(webContents));
      // Notify the renderer process that we are listening for notifications
      webContents.send(NOTIFICATION_SERVICE_STARTED, credentials.fcm.token);
    } catch (e) {
      console.error('PUSH_RECEIVER:::Error while starting the service', e);
      // Forward error to the renderer process
      webContents.send(NOTIFICATION_SERVICE_ERROR, e.message);
    }
  });
}

// Will be called on new notification
function onNotification(webContents) {
  return ({ notification, persistentId }) => {
    const persistentIds = config.get('persistentIds') || [];
    // Update persistentId
    config.set('persistentIds', [...persistentIds, persistentId]);
    // Notify the renderer process that a new notification has been received
    webContents.send(NOTIFICATION_RECEIVED, notification);
  };
}
