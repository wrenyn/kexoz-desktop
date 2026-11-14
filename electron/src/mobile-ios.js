// iOS Mobile Preview is not shipping yet — UI shows "Coming soon".
// Keep this stub so a future adapter can plug in without touching Android.

async function discoverIosSimulators() {
  return {
    devices: [],
    comingSoon: true,
    error: 'iOS Mobile Preview is coming soon.',
    capabilities: { screen: false, remoteInput: false, viewOnly: true },
  };
}

function physicalIphoneCapabilities() {
  return {
    platform: 'ios-physical',
    comingSoon: true,
    screen: false,
    remoteInput: false,
    keyboard: false,
    rotation: false,
    viewOnly: true,
    notes: 'Coming soon. Physical iPhone will be view-only via ReplayKit when enabled.',
  };
}

module.exports = {
  discoverIosSimulators,
  physicalIphoneCapabilities,
};
