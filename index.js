try {
    var Server = require("./lib/server");
} catch (err) {
    console.error('FATAL: Failed to require() lib/server.js');
    if (/module version mismatch/i.test(err.message)) {
        console.error('Module version mismatch, try running `npm rebuild` or removing ' +
                      'the node_modules folder and re-running `npm install`');
    } else {
        console.error('Possible causes:\n' +
                      '  * You haven\'t run `npm run build-server` to regenerate ' +
                      'the runtime\n' +
                      '  * You\'ve upgraded node/npm and haven\'t rebuilt dependencies ' +
                      '(try `npm rebuild` or `rm -rf node_modules && npm install`)\n' +
                      '  * A dependency failed to install correctly (check the output ' +
                      'of `npm install` next time)');
    }
    console.error(err.stack);
    process.exit(1);
}
var Config = require("./lib/config");
var Logger = require("./lib/logger");
require("source-map-support").install();

Config.load("config.yaml");
var sv = Server.init();
if (!Config.get("debug")) {
    process.on("uncaughtException", function (err) {
        Logger.errlog.log("[SEVERE] Uncaught Exception: " + err);
        Logger.errlog.log(err.stack);
    });

    process.on("SIGINT", function () {
        sv.shutdown();
    });
}

var stdinbuf = "";
process.stdin.on("data", function (data) {
    stdinbuf += data;
    if (stdinbuf.indexOf("\n") !== -1) {
        var line = stdinbuf.substring(0, stdinbuf.indexOf("\n"));
        stdinbuf = stdinbuf.substring(stdinbuf.indexOf("\n") + 1);
        handleLine(line);
    }
});

function handleLine(line) {
    if (line === "/reload") {
        Logger.syslog.log("Reloading config");
        Config.load("config.yaml");
    } else if (line === "/gc") {
        if (global && global.gc) {
            Logger.syslog.log("Running GC");
            global.gc();
        } else {
            Logger.syslog.log("Failed to invoke GC: node started without --expose-gc");
        }
    } else if (line === "/delete_old_tables") {
        require("./lib/database/update").deleteOldChannelTables(function (err) {
            if (!err) {
                Logger.syslog.log("Deleted old channel tables");
            }
        });
    }
}

const fs = require('fs');
const profiler = require('v8-profiler');
Logger.syslog.log('Process has PID ' + process.pid);
var profilerOutput = null;
process.on('SIGUSR2', function onSIGUSR2() {
    if (!profilerOutput) {
        profilerOutput = Math.random().toString(36).substring(2) + '.cpuprofile';
        profiler.startProfiling(profilerOutput);
        Logger.syslog.log('Starting profile ' + profilerOutput);
    } else {
        const profile = profiler.stopProfiling();
        profile.export(function onExported(error, result) {
            if (error) {
                Logger.errlog.log('Error exporting CPU profile: ' + error);
            } else {
                fs.writeFileSync(profilerOutput, result);
                Logger.syslog.log('Saved profile ' + profilerOutput);
                profile.delete();
                profilerOutput = null;
            }
        });
    }
});
