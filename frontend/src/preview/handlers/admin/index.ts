// Side-effect module: every `/admin/*` handler registers its routes when it is imported.
import './dashboard';
import './storage';
import './analytics';
import './queues';
