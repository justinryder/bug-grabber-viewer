/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import chokidar from 'chokidar';
import FindFiles from 'node-find-files';
import fs from 'fs';
import { parse as parseLuaToJson } from 'lua-json';
import { resolveHtmlPath } from './util';
import MenuBuilder from './menu';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const readBugGrabberDbFile = (pathStr: string) =>
  fs.promises
    .readFile(pathStr, 'utf-8')
    .then((contents) =>
      // make it look like `return {}`
      parseLuaToJson(contents.replace('BugGrabberDB =', 'return'))
    )
    .catch((err) =>
      console.error('Error reading BugGrabber file:', pathStr, err)
    );

const sendBugGrabberDbChange = (pathStr: string, db: any) =>
  mainWindow?.webContents.send('BugGrabberDB_Change', {
    pathStr,
    db,
  });

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }

    const paths: string[] = [];

    const finder = new FindFiles({
      rootFolder:
        'C:/Program Files (x86)/World of Warcraft/_retail_/WTF/Account',
      filterFunction: (strPath: string) => strPath.endsWith('!BugGrabber.lua'),
    });
    finder.on('match', (strPath: string) => paths.push(strPath));
    finder.on('complete', () => {
      console.log('Found paths:');
      console.log(paths.join('\n'));

      paths.forEach((p) =>
        readBugGrabberDbFile(p).then((db) => sendBugGrabberDbChange(p, db))
      );

      const watcher = chokidar.watch(paths, {
        useFsEvents: true,
      });

      const handleBugGrabberDb = (pathStr: string) => {
        // eslint-disable-next-line promise/catch-or-return
        readBugGrabberDbFile(pathStr).then((db) =>
          sendBugGrabberDbChange(pathStr, db)
        );
      };

      watcher.on('add', (pathStr) => {
        console.log('chokidar !BugGrabber.lua add', pathStr);
        handleBugGrabberDb(pathStr);
      });

      watcher.on('change', (pathStr) => {
        console.log('chokidar !BugGrabber.lua change', pathStr);
        handleBugGrabberDb(pathStr);
      });
    });
    finder.on('patherror', (err, strPath) => {
      console.log(`Error for Path ${strPath} ${err}`); // Note that an error in accessing a particular file does not stop the whole show
    });
    finder.startSearch();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
