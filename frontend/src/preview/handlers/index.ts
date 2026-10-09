// Side-effect module: later tasks import their handler files here so that
// every `route(...)` registration runs once when the preview layer loads.
import './me-basic';
import './catalog';
import './assets-read';
import './search';
import './library';
import './notifications';
import './comments';
import './assets-write';
import './versions';
import './uploads';
import './downloads';
import './gifs';
import './analytics';
