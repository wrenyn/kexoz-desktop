const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    // No extension: packager picks icon.ico, icon.icns or icon.png per platform.
    icon: './assets/icon',
    executableName: 'kexoz',
    extraResource: ['../frontend/dist'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'kexoz-desktop',
        setupExe: 'Kexoz-Setup.exe',
        setupIcon: './assets/icon.ico',
        // Squirrel needs a URL for the Programs and Features icon.
        iconUrl: 'https://raw.githubusercontent.com/wrenyn/kexoz-desktop/main/electron/assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'kexoz-desktop',
          productName: 'Kexoz',
          bin: 'kexoz',
          icon: './assets/icon.png',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'kexoz-desktop',
          productName: 'Kexoz',
          bin: 'kexoz',
          icon: './assets/icon.png',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'wrenyn',
          name: 'kexoz-desktop'
        },
        prerelease: false,
        draft: false
      }
    }
  ]
};
