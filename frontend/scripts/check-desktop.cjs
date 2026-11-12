/* Render every desktop route and the main setup/dialog states without API access.
 * Run with: node scripts/check-desktop.cjs
 * This is a rendering smoke check; it does not replace Electron interaction tests.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// Initialize SSR-aware dependencies before adding the minimal storage shim.
require('react-hot-toast');
require('recharts');
require('axios');

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } });
    module._compile(outputText, filename);
  };
}

const memory = new Map();
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
global.window = { localStorage: storage, sessionStorage: storage, location: { href: 'https://desktop.example.test/' } };
global.document = { activeElement: null };
global.HTMLElement = class HTMLElement {};
const noop = () => {};
const session = { id: 'render-fixture', subdomain: 'studio', domains: ['studio'], port: 3000, ownerEmail: 'alex@example.test', plan: 'pro', customDomain: '', dnsTarget: '', bandwidthUsed: 100, bandwidthLimit: 1000, pathRoutes: [] };
const tunnel = { id: 'web', subdomain: 'studio', customDomain: '', name: 'Studio frontend', port: 3000, active: false, status: 'stopped', pathRoutes: [], preview: true, tunnelType: 'http' };
const project = { id: 'studio-project', name: 'Studio', tunnelIds: ['web'] };
const common = {
  session, clientId: session.id, ownerEmail: session.ownerEmail,
  tunnels: [tunnel], persistentTunnels: [tunnel], projects: [project], projectsLoaded: true, projectsError: '',
  openId: null, selectedId: 'web', selectedTunnelId: null, portInput: '3000', routeRules: [], routePortStatus: {},
  theme: 'dark', requestLog: [], totalRequests: 0, retention: 100, hosts: ['studio.kexoz.dev'],
  bytesIn: 0, bytesOut: 0, dailyUsage: [], connectionEvents: [], feedbackNotes: [], shareCount: 1,
  verifying: false, gauthEnabled: true, isBusy: false, portListening: null,
  onNewShare: noop, onVerify: noop, onSignOut: noop, onRetryProjects: noop,
  onViewRequests: noop, onViewShares: noop, onViewFeedback: noop, onThemeChange: noop,
};
const checks = [];
function render(file, props, expected) {
  const Component = require(path.join(__dirname, '../src/components', file)).default;
  const html = renderToStaticMarkup(React.createElement(Component, { ...common, ...props }));
  assert.ok(html.includes(expected), `${file}: expected ${expected}`);
  assert.ok(!/NaN|\[object Object\]/.test(html), `${file}: invalid rendered value`);
  checks.push(`${file}: ${expected}`);
  return html;
}

for (const [file, title] of [
  ['DashboardPage', 'Overview'], ['ProjectsPage', 'Projects'], ['ReviewPage', 'Feedback'],
  ['TeamPage', 'Team'], ['DomainsPage', 'Domains'], ['RequestsPage', 'Traffic'],
  ['SettingsPage', 'Settings'], ['AccountPage', 'Account'],
]) render(`pages/${file}.tsx`, {}, title);

render('pages/ProjectsPage.tsx', { openId: project.id }, 'Studio');
render('pages/ProjectsPage.tsx', { projects: [], persistentTunnels: [], projectsError: 'Connection failed' }, 'Try again');
render('pages/ReviewPage.tsx', { tunnels: [], selectedId: null }, 'Create a web share');
render('pages/DashboardPage.tsx', { tunnels: [] }, 'Create your first share');
render('pages/AccountPage.tsx', { session: { ...session, ownerEmail: '' } }, 'Continue with Google');
render('pages/TeamPage.tsx', { session: { ...session, ownerEmail: '' } }, 'Sign in required');

for (const section of ['appearance', 'capture', 'alerts', 'integrations', 'developer']) {
  storage.setItem('kexoz-settings-section', section);
  const html = render('pages/SettingsPage.tsx', {}, section === 'developer' ? 'Keyboard shortcuts' : 'Settings');
  if (section === 'appearance') assert.equal((html.match(/type="radio"/g) || []).length, 2);
  if (section === 'alerts') assert.equal((html.match(/aria-label="[^"]*notifications"/g) || []).length, 2);
}
render('screens/GateScreen.tsx', { onLogin: noop, onSkip: noop }, 'Continue with Google');
render('screens/GateScreen.tsx', { verifying: true, code: '123456' }, 'Finish in the browser');
render('screens/SubdomainScreen.tsx', { subdomainInput: 'studio', setSubdomainInput: noop }, 'Your address');
const loading = render('screens/LoadingScreen.tsx', { statusMessage: 'Loading your shares', errorMessage: '', onRetry: noop }, 'progressbar');
assert.ok(!loading.includes('aria-valuenow'), 'Unknown startup duration must not show a fabricated percentage');
render('screens/LoadingScreen.tsx', { statusMessage: '', errorMessage: 'Cannot connect', onRetry: noop }, 'Try again');
const modal = render('modals/NewShareModal.tsx', { addresses: [{ name: 'studio', usedBy: [] }], environments: {}, onClose: noop }, 'aria-modal="true"');
assert.ok(modal.includes('Anyone with the link'), 'Sharing access must be explicit');
render('modals/ConfirmDialog.tsx', { title: 'Remove teammate?', message: 'Access will be removed.', confirmLabel: 'Remove', tone: 'danger', onConfirm: noop, onCancel: noop }, 'alertdialog');
render('review/RevisionModal.tsx', { tunnel, notes: [], onClose: noop, onSaved: noop }, 'New version');
render('review/GitHubModal.tsx', { status: { connected: false, login: '', encrypted: false }, repo: '', shareName: 'Studio', onClose: noop }, 'Personal access token');
render('review/LinearModal.tsx', { status: { connected: false, name: '', encrypted: false }, teamId: '', shareName: 'Studio', onClose: noop }, 'Linear');
render('review/CaptureInviteDialog.tsx', { tunnel, onClose: noop }, 'aria-modal="true"');
console.log(`Passed ${checks.length} desktop render checks: all 8 pages, all settings sections, setup screens, and main dialogs.`);
