const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseDevices } = require('./mobile');

describe('parseDevices', () => {
  it('parses emulator and usb rows', () => {
    const stdout = [
      'List of devices attached',
      'emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1',
      'R58M123ABC             device usb:1-1 product:beyond1qlteue model:SM_G973U device:beyond1q transport_id:2',
      'unauthorized_device    unauthorized',
      '',
    ].join('\n');
    const devices = parseDevices(stdout);
    assert.equal(devices.length, 3);
    assert.equal(devices[0].emulator, true);
    assert.equal(devices[0].capabilities.remoteInput, true);
    assert.equal(devices[1].model, 'SM_G973U');
    assert.equal(devices[2].capabilities.remoteInput, false);
  });
});
