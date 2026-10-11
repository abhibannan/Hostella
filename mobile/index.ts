import { registerRootComponent } from 'expo';

import { ensureNotificationChannels } from './src/hooks/useExpoPushNotifications';

// Immediately register Android notification channels at cold startup
void ensureNotificationChannels();

// IMPORTANT: This import MUST come before registerRootComponent.
// It defines the headless background task that handles push notifications
// when the app is killed. TaskManager.defineTask() runs at import time.
import './src/services/backgroundNotificationTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
